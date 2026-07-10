# Tech Stack — working set and rationale

Source: product requirements [`docs/product-requirements.md`](../product-requirements.md) §10.

> **Decision status.** The stack below is the PRD's recommendation, encoded as the working
> default. Items marked **(business)** lock the project into commitments and require explicit
> user confirmation before they are treated as final. Items marked **(engineering)** are
> internal defaults I will apply and report; the user can override.

## Layers

| Layer | Choice | Status | Notes |
|---|---|---|---|
| Smart contracts | Solidity on EVM | (business) | Compliant asset tokens via `ERC-3643 (T-REX)` + `ONCHAINID`; `ERC-20` for utility. |
| Contract testing | Foundry | (engineering) | Fast Solidity-native unit + fuzz + invariant tests. |
| Backend | NestJS + PostgreSQL | (business) | Aligns with stated team capability. |
| Web | Next.js | (business) | Investor dashboard + issuer portal. |
| Mobile | Flutter | (business) | Retail investor access. |
| Doc storage | IPFS (+ Postgres metadata) | (business) | Immutable legal documents. |
| Custody | Self-hosted MPC + multisig | (business) | Sanctions context rules out hosted custody by default. |
| Oracle | Internal signed-attestation feed | (business) | Chainlink only if/when accessible. |
| Settlement | Domestic-asset / Rial-based | (business) | No USDC/USDT assumption (PRD §3). |

## Engineering defaults (I apply, report, and you may override)

- **Language:** TypeScript `strict`; ESLint + Prettier; no implicit `any`.
- **Monorepo:** **pnpm workspaces** (user-confirmed 2026-07-10; pnpm needs a one-time install —
  npm 10 is present, pnpm is not yet). Turborepo/Nx deferred under YAGNI until the task graph
  justifies it.
- **ORM:** **Prisma** (user-confirmed 2026-07-10) — typed client behind repository ports; the
  Prisma client never crosses into the domain layer.
- **API testing:** Jest (NestJS default) or Vitest — decided at scaffolding with rationale.
- **Web testing:** Vitest + Testing Library; Playwright for critical-journey E2E only.
- **Mobile testing:** `flutter_test` + integration_test.
- **Commits:** Conventional Commits. **Branching:** short-lived feature branches off a
  protected default branch (guarded by hooks against force-push).
- **CI gates (when set up):** lint, typecheck, unit + integration tests, contract tests,
  coverage threshold, secret scan. A red gate blocks merge.

## Explicitly deferred (YAGNI until needed)

- Multi-chain abstraction beyond one port + one adapter.
- Kubernetes / heavy infra orchestration.
- Event-sourcing / CQRS unless a concrete requirement demands it.
- Any white-label / multi-tenant generalization before a second tenant exists.

## Decisions confirmed 2026-07-10 (were open; now locked)

1. **Package manager: pnpm** (workspaces; install pending at scaffolding).
2. **Initial target network: self-hosted permissioned Hyperledger Besu** (PRD §16 D2).
3. **First pilot asset: real-estate SPV** (PRD §16 D1) — legal structuring is the pilot's
   critical path; rental-yield distribution is the flagship feature demo.
4. **ORM: Prisma.**

Still open (business, PRD §16): settlement unit (D3), investor categories (D4), offering
policies (D5), revenue activation (D6).
