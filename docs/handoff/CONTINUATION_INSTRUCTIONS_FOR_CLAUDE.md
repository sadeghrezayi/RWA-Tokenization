# CONTINUATION INSTRUCTIONS FOR CLAUDE

You are continuing development of an existing software project that was developed collaboratively
with Claude over approximately 45 days. **Do not redesign the system from scratch.** The
repository and these handoff documents are the source of truth. Read the required files before
modifying code.

---

## Mandatory startup procedure (every new conversation, before any code change)

1. Read `CLAUDE.md` (repository root) and `.claude/core-invariants.md`. These are **canonical**
   and override anything else, including your own preferences and any conversation history.
2. Read `docs/handoff/PROJECT_MASTER_CONTEXT.md` — what this is and what must not change.
3. Read `docs/handoff/ARCHITECTURE.md` — how it is actually built.
4. Read `docs/handoff/IMPLEMENTATION_STATUS.md` — what exists and what does not. **Never assume a
   feature is missing without searching the repository first.**
5. Read `docs/handoff/DECISION_LOG.md` — and, for anything load-bearing, the append-only original
   `docs/open-product-decisions.md`.
6. Read `docs/handoff/CURRENT_BACKLOG.md` and `docs/handoff/KNOWN_ISSUES.md`.
7. Inspect the implementation files relevant to the task (use `docs/handoff/REPOSITORY_MAP.md` so
   you do not have to rediscover the tree).
8. Run `git status` and `git log --oneline -5`. Confirm the working tree state before touching it.
9. Confirm the intended next task **against the backlog and the decision log**. If the user's ask
   conflicts with a recorded decision, say so and ask — do not silently override it.
10. Only then modify code — and only with a failing test first.

---

## Non-negotiable working rules

These come from `.claude/core-invariants.md` and are the user's standing orders.

1. **TDD.** Write the failing test first and **observe the red output**. No production code before
   a test that justifies it. Existing tests are a regression floor — never edit them to make new
   code pass, except as a deliberate, documented behaviour change.
2. **Clean Architecture.** `domain → application → infrastructure`. The domain imports no
   framework, no Prisma, no HTTP, no ethers. Ports are interfaces in `application/*/ports.ts`;
   adapters live in `infrastructure/`; they meet **only** in `services/api/src/app.module.ts`.
3. **SOLID, DRY, YAGNI.** One authoritative definition per concept. Build what the agreed
   requirement needs — no speculative generality.
4. **No solo business decisions.** Scope, asset choice, tokenomics, regulatory posture, product
   trade-offs and stack lock-in are the **user's** calls. Surface options with a recommendation
   and wait. Engineering-internal choices you make and report.
5. **Verify before "done".** Run it, read the output. Never report success you did not observe.
   If a step was skipped or is failing, say so plainly.
6. **Never settle for "good enough"** while a concrete improvement remains — flag it explicitly.
7. **One verified step at a time**, each ending with lint + typecheck + format + the relevant
   suites green, then a commit, then CI green.
8. **Never fabricate regulatory compliance.** Jurisdiction-specific rules are configuration marked
   "REQUIRES LOCAL LEGAL VALIDATION".
9. **Never claim a feature exists** unless it is implemented, tested and reachable in the UI. No
   fake buttons, dead navigation or mock workflows in production routes.
10. **Never put secrets in code, documentation or commits.** `guard-write.sh` blocks key material,
    but do not rely on it.
11. **Never expose PII beyond role permissions.**
12. **English** for all product copy and documentation.

## Definition of Done (a slice is not finished until all six hold)

1. A failing test was written first and now passes.
2. Lint, typecheck and format are clean.
3. Edge cases and error paths are tested.
4. No dead code, no unexplained TODO.
5. Behaviour was verified by actually running it and reading the output.
6. Decisions and assumptions were reported to the user.

If any item is unmet, report the work as **in progress with the specific gap named** — do not call
it done.

## Techniques this project relies on (use them)

- **Mutation checking** for security-critical rules: deliberately break the rule, confirm the
  *specific* expected tests fail, then restore. Use it for anything that gates money, PII or
  eligibility. Examples already in the history: the issuer verification gate, tenant isolation,
  pro-rata allocation, the document-disclosure seam.
- **Shared repository contract tests**: the same suite runs against the in-memory fake and the
  Prisma implementation. **Extend it whenever you add a persisted field** — it has caught silently
  dropped columns twice.
- **Distinguish "empty" from "failed to load"**, and **"not established" from "none"**. This
  distinction has mattered repeatedly in this domain.
- **Absent facts stay absent.** With `exactOptionalPropertyTypes`, omit optional fields via a
  conditional spread rather than setting `undefined` or `""`.

## Conventions

- **Commits:** Conventional Commits, imperative subject, body explaining *why*, ending with the
  `Co-Authored-By:` trailer used throughout the history. Commit only when the user asks or when a
  verified slice is complete; the project's habit is one commit per verified slice, pushed to
  `main`, then CI watched to green.
- **CI:** watched through the public GitHub API with `curl` (the `gh` CLI is not used; job logs
  return 403 without admin rights — the **step summary** is the readable channel).
- **Migrations:** edit `schema.prisma` → `migrate diff --script` → hand-write the SQL →
  `migrate deploy` → `generate` → drift check with `--exit-code`.
- **Servers:** use the Claude Code preview tooling and `.claude/launch.json`; never start dev
  servers with raw Bash.
- **Ports:** API 3001, web 3000, Postgres 5433, IPFS 5001, anvil 8545.

## Things that will bite you (learn from the history)

- **Do not touch the nonce design in `infrastructure/chain/custodial-wallets.ts`** without reading
  its comments and DECISION_LOG C4. Two "obvious simplifications" were tried and both broke the
  chain suite badly.
- **A 500 is not necessarily logged** unless it goes through the mapped path — check
  `domain-error.filter.ts` before concluding "no error was raised".
- **The API prefers the session cookie over the Bearer header** when both are present.
- **The tenant-scoped Prisma proxy forbids `findUnique`/`update`/`upsert`/`delete`.** Use
  `findFirst`/`updateMany`/`deleteMany`/`create` in repositories.
- **The integration suite needs anvil with deployed contracts**, or two e2e tests fail for
  environmental reasons that look like regressions.

## When you change something material

- Update `docs/open-product-decisions.md` (append-only) with any new decision, its reasoning, its
  consequences, and whether the user decided it or you did.
- Update the affected handoff file(s) in `docs/handoff/` — especially `IMPLEMENTATION_STATUS.md`,
  `CURRENT_BACKLOG.md` and `KNOWN_ISSUES.md` — and bump `project_state.json`'s `generated_at`.
- Keep `HANDOFF_INDEX.md`'s "corresponds to commit" line accurate.

## What to work on next

See `CURRENT_BACKLOG.md`. Unless the user says otherwise, the intended next slice is **P0-1: the
ops review screen for issuer applications**, because Phase 3.2's API exists with no user interface
and the project does not consider a feature delivered until a person can use it.
