# RUNBOOK — running, testing and resetting the system

Every command below is taken from the repository's actual scripts, `docker-compose.yml`,
`.claude/launch.json` or `.github/workflows/ci.yml`. Run them from the **repository root** unless
a working directory is given.

---

## 1. Prerequisites

| Tool | Version | Why |
|---|---|---|
| Node.js | **≥ 22** (`engines` in root `package.json`) | API and web |
| pnpm | **10.12.1** (`packageManager` field — use corepack) | Workspace manager |
| Docker | any recent | Postgres + IPFS |
| Foundry (`forge`, `anvil`) | `stable` | Contracts and devnet |

```bash
corepack enable && corepack prepare pnpm@10.12.1 --activate
```

## 2. Install

```bash
pnpm install --frozen-lockfile
```

```bash
pnpm --filter @tokenization/api exec prisma generate
```

## 3. Environment

Copy the template and fill it in (the template documents how to generate each secret):

```bash
cp services/api/.env.example services/api/.env
```

| Variable | Service | Required? | Notes |
|---|---|---|---|
| `DATABASE_URL` | API | **yes** | Matches compose: port **5433** on the host |
| `PORT` | API | no | Defaults to 3001 |
| `AUTH_TOKEN_SECRET` | API | **yes** | JWT signing secret |
| `OFFICER_EMAIL`, `OFFICER_PASSWORD_HASH` | API | **yes** for admin login | Hash generated with argon2 — the template shows the one-liner |
| `OFFICER2_EMAIL`, `OFFICER2_PASSWORD_HASH` | API | no | Seeds a treasury user for real two-officer maker-checker |
| `OFFICER3_EMAIL`, `OFFICER3_PASSWORD_HASH` | API | no | Seeds the read-only **auditor** account (default `auditor@platform.local`) — FR-RA-4. Set the hash in production; without it the dev password applies, same as the other two |
| `KYC_EVIDENCE_KEY` | API | **yes in any real use** | 32 bytes. **Unset ⇒ loud warning + an INSECURE dev key; identity documents are not protected** |
| `FUNDING_BANK_NAME`, `FUNDING_ACCOUNT_HOLDER`, `FUNDING_ACCOUNT_NUMBER`, `FUNDING_NOTICE` | API | no locally | The platform's own bank details. Unset ⇒ "NOT CONFIGURED" placeholders + a warning |
| `DEVNET_RPC_URL`, `PLATFORM_OPERATOR_MNEMONIC`, `ONCHAINID_CLAIM_ISSUER_ADDRESS` | API | all three, or none | All three present ⇒ real ONCHAINID adapter; otherwise a logging placeholder and the app still boots |
| `ATTESTATION_REGISTRY_ADDRESS` | API | for on-chain anchoring | Printed by the deploy script |
| `LEDGER_CREDIT_APPROVAL_THRESHOLD_RIAL` | API | no | Above this, a credit needs maker-checker. **Placeholder value — requires local policy validation** |
| `SCHEDULED_JOBS_ENABLED`, `FOLLOW_UP_DUE_CRON` | API | no | pg-boss cron opt-in |
| `OUTBOX_DRAIN_INTERVAL_MS` | API | no | Outbox drain tick |
| `REVALIDATE_SECRET` | **API *and* web** | yes if using ISR | Must be **the same value on both** or a freshly published offering stays out of the public catalogue for the whole revalidate window |
| `WEB_ORIGIN`, `SITE_URL` | API/web | no | Absolute links and CORS/cookies |
| `NEXT_PUBLIC_API_URL` / `API_URL` | web | no | Defaults to `http://localhost:3001` |
| `IPFS_API_URL` | API | yes for document upload | `http://127.0.0.1:5001` |

**Never commit `.env`.** `.gitignore` already excludes `.env` and `.env.*` except `.env.example`.

## 4. Start the infrastructure

```bash
docker compose up -d
```

Postgres → `localhost:5433` (container `tokenization-postgres`), IPFS API → `localhost:5001`
(container `tokenization-ipfs`).

## 5. Database

Apply all migrations (this is also the CI "migration check" against an empty database):

```bash
pnpm --filter @tokenization/api exec prisma migrate deploy
```

Create a **new** migration after editing `schema.prisma` — the workflow used throughout this
project (do not deviate):

```bash
pnpm --filter @tokenization/api exec prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script
```

then hand-write/review `prisma/migrations/<timestamp>_<name>/migration.sql`, run
`prisma migrate deploy`, `prisma generate`, and confirm no drift:

```bash
pnpm --filter @tokenization/api exec prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --exit-code
```

Exit code **0** = schema and database agree; **2** = drift.

> **Seed data:** there is **no seed script**. The demo dataset is created by walking
> `TEST_SCENARIOS.md` through the UI, or by the Playwright journey's API seeding
> (`apps/web/e2e/seed.ts`). The dev database is treated as disposable (OD-15).

## 6. Devnet and contracts

Start the devnet with the **standard public anvil/hardhat test mnemonic**. That value is *not* a
secret and is not repeated here — copy it from `services/api/.env.example`
(`PLATFORM_OPERATOR_MNEMONIC`, where it is labelled devnet-only) or from
`.github/workflows/ci.yml`, which uses the same one:

```bash
anvil --mnemonic "$PLATFORM_OPERATOR_MNEMONIC"
```

In another shell — `forge script` does **not** read `.env`, so the variable must be present in the
environment of the command itself:

```bash
cd contracts && PLATFORM_OPERATOR_MNEMONIC="<the devnet mnemonic from .env.example>" forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast
```

It prints `ONCHAINID_CLAIM_ISSUER_ADDRESS=` and `ATTESTATION_REGISTRY_ADDRESS=`; copy both into
`services/api/.env`. On a fresh anvil with that mnemonic they are deterministic:
`0x5FbDB2315678afecb367f032d93F642f64180aa3` and `0xa85233C63b9Ee964Add6F2cffe00Fd84eb32338f`.

## 7. Run the applications

API (build first, or use the launch config):

```bash
pnpm --filter @tokenization/api build && node --env-file=services/api/.env services/api/dist/main.js
```

Web (dev server on port 3000):

```bash
pnpm --filter @tokenization/web dev
```

`.claude/launch.json` defines the same two as named preview servers (`api` → 3001, `web` → 3000)
for Claude Code's browser tooling. **Do not start dev servers with raw Bash in Claude Code —
use the preview tooling.**

Background workers: there is **no separate worker process**. The outbox drainer runs inside the
API on an interval, and pg-boss cron starts with the API when `SCHEDULED_JOBS_ENABLED` is set.

## 8. Tests

```bash
pnpm --filter @tokenization/api test
```

```bash
pnpm --filter @tokenization/api test:integration
```

```bash
pnpm --filter @tokenization/web test
```

```bash
cd contracts && forge test -vv
```

Playwright layout contracts + the Phase-2 exit journey (needs API on 3001 and web on 3000 already
running, with `REVALIDATE_SECRET` set on both):

```bash
pnpm --filter @tokenization/web test:layout
```

> **Which browser Playwright uses.** `playwright.config.ts` reads `PLAYWRIGHT_CHANNEL` and
> defaults to the `chrome` channel — i.e. **your installed Google Chrome**. CI sets
> `PLAYWRIGHT_CHANNEL=""` so the runner uses Playwright's own bundled Chromium instead.
> On this development machine the bundled browser **cannot be installed**:
> `npx playwright install` returns **403 "this service is not available in your location"** from
> `cdn.playwright.dev`. So locally, leave `PLAYWRIGHT_CHANNEL` unset and the suite runs against
> Chrome. Do not copy CI's empty value into a local run.

Notes:
- **Rebuild the API before checking an API change in a browser.** `.claude/launch.json`
  starts the API from `services/api/dist/main.js`, so the preview serves the last BUILD, not
  the working tree. A new endpoint answers **404** and a changed one silently serves the old
  behaviour — which reads exactly like a bug in the code you just wrote. This cost three
  separate diagnoses on 2026-08-19, one of them nearly filed as a defect:
  `pnpm --filter @tokenization/api build`, then restart the preview.
- The integration suite runs against **its own database**, not the one the dev server serves.
  `test/integration/use-a-separate-database.ts` takes `DATABASE_URL`, suffixes the database name
  (`tokenization` → `tokenization_test`), creates it if missing, and applies the same migrations
  with `migrate deploy`. Override with `TEST_DATABASE_URL`. This is why the suite may clear whole
  tables: it owns everything in there. **Your demo data is no longer destroyed by running the
  tests** — before this, fifteen files called `deleteMany()` on the shared database.
- The **integration suite requires Postgres, IPFS and a running anvil with deployed contracts**.
  Without anvil the six chain suites self-skip **and two e2e tests fail** (KYC approve and the
  work queue) because the real ONCHAINID adapter cannot reach the chain — that is an environment
  failure, not a regression.
- **If the chain suites start timing out**, restart anvil before suspecting the code. A node left
  running for days degrades badly: measured 2026-08-18 with the identical one-contract deploy,
  **101 ms on a fresh anvil against 4121 ms on one with 2119 blocks** — 40× slower per
  transaction, which blows the 30/60/90-second hooks a T-REX deployment needs (KNOWN_ISSUES
  K-23). Reads stayed instant throughout, so the node looks healthy right up until you time it.
- The integration config runs files **serially** (`fileParallelism: false`).

## 9. Lint, format, typecheck, build

```bash
pnpm lint
```

```bash
pnpm format
```

```bash
pnpm format:fix
```

```bash
pnpm -r typecheck
```

```bash
pnpm --filter @tokenization/api build && pnpm --filter @tokenization/web build
```

## 10. Reset procedures

Reset the database completely (dev only — the dev DB is disposable by decision OD-15):

```bash
docker compose down -v && docker compose up -d && pnpm --filter @tokenization/api exec prisma migrate deploy
```

Reset the chain: stop `anvil`, start it again with the same mnemonic, redeploy the contracts, and
update the two addresses in `.env`. **Any previously tokenized asset's `tokenAddress` in Postgres
now points at nothing** — reset the database too, or expect chain reads for those assets to fail.

## 11. Common failures

| Symptom | Cause | Fix |
|---|---|---|
| Integration tests: `expected 204, got 500` on KYC approve | anvil not running, or contracts not deployed, while `DEVNET_RPC_URL` is set | Start anvil + deploy, or unset the three devnet vars to fall back to the logging adapter |
| `vm.envString: environment variable "PLATFORM_OPERATOR_MNEMONIC" not found` | `forge script` does not read `.env` | Prefix the command with the variable, as in §6 |
| A published offering does not appear on the public site | `REVALIDATE_SECRET` missing or different between API and web | Set the same value on both |
| `prisma` client type errors after a schema change | `prisma generate` not run | Run it |
| Supertest requests behave as the wrong user | The API prefers the **cookie** over the Bearer header when both are present | Use one request context per actor; send `x-csrf-token` for cookie auth |
| `pnpm vitest` → "Command vitest not found" | Run from the repo root instead of the package | `cd services/api` first, or use `pnpm --filter @tokenization/api test` |
| Port 5432 conflicts | Compose deliberately maps Postgres to **5433** | Use 5433 in `DATABASE_URL` |
| **Every** server-rendered page 500s with `SyntaxError: … JSON at position 979` (even `/favicon.ico`), while client-rendered admin pages still work | Corrupt Next dev artifact `apps/web/.next/prerender-manifest.json` | `rm -rf apps/web/.next` and restart the dev server (`.next` is git-ignored build output) |
| `npx playwright install` fails with 403 "not available in your location" | Geographic block on `cdn.playwright.dev` | Run against the system Chrome — leave `PLAYWRIGHT_CHANNEL` unset (see §8) |
| The admin console shows only a login form and every attempt fails | `OFFICER_EMAIL` / `OFFICER_PASSWORD_HASH` are unset in `services/api/.env` — with no officer configured there is no way into the console at all | Generate the argon2 hash with the one-liner in `.env.example`, set both, restart the API |
