# Tokenization Platform — Core Invariants (non-negotiable)

> Single source of truth. Auto-injected at session start AND re-injected after every
> context compaction via `.claude/hooks/session-context.sh`. If this conflicts with
> anything in the conversation history, THIS wins. Read it as standing orders.

## 1. Engineering discipline (not optional)
- **TDD is mandatory.** Red → Green → Refactor. No production code is written before a
  failing test that justifies it. A change is not "done" until its tests are written,
  passing, and meaningful (behavior, not implementation detail).
- **Clean Architecture.** Dependencies point inward: domain → application → infrastructure.
  The domain knows nothing about frameworks, DBs, HTTP, or chains. Business rules are
  testable without I/O.
- **SOLID** at every unit boundary. **DRY** — one authoritative definition per concept.
  **YAGNI** — build what the current, agreed requirement needs; no speculative generality.

## 2. Working agreement (how I operate on this project)
- **No solo business decisions.** Scope, asset choice, tokenomics, regulatory posture,
  product trade-offs, and stack lock-in are the user's calls. I surface options + a
  recommendation and wait. Engineering-internal choices I make and report.
- **Verify before "done."** I never report success I have not observed. Tests run, output
  read, behavior confirmed. If something is skipped or failing, I say so plainly.
- **Never settle for "good enough" while there is room to improve.** I proactively flag
  weaknesses, edge cases, and follow-ups rather than quietly leaving them.
- **One step at a time, verified.** We move to the next step only after the current one is
  built AND verified.

## 3. Definition of Done (every deliverable)
1. Failing test written first → now passing. 2. Lint + typecheck + format clean.
3. Edge cases and error paths covered. 4. No dead code, no TODO left unexplained.
5. Behavior verified by actually running it. 6. Decisions/assumptions reported to the user.

## 4. Canonical references (read before acting in these areas)
- Product requirements (source of truth for the product): `docs/product-requirements.md`
- Architecture: `docs/engineering/architecture.md`
- SOLID/DRY/YAGNI in practice: `docs/engineering/principles.md`
- TDD workflow + DoD detail: `docs/engineering/tdd.md`
- Tech stack + rationale: `docs/engineering/tech-stack.md`
- Domain glossary: `docs/engineering/glossary.md`

## 5. Tech stack (per product requirements — confirm before locking deviations)
Smart contracts: Solidity/EVM, ERC-3643 (T-REX) for asset tokens, ERC-20 for utility.
Backend: NestJS + PostgreSQL. Web: Next.js. Mobile: Flutter. Docs/storage: IPFS + Postgres
metadata. Custody: self-hosted MPC + multisig. Oracle: internal signed attestation.
Deployment posture → self-hosted, permissioned, closed-loop, domestic-asset settlement.
