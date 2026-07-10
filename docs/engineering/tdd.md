# TDD — the loop and the Definition of Done

TDD is mandatory on this project. Not "we write tests." Tests come **first** and drive design.

## The loop: Red → Green → Refactor

1. **Red.** Write the smallest test that expresses the next bit of required behavior. Run it.
   Watch it fail for the *right reason* (assertion fails — not a compile/import error you
   ignored). A test that has never failed proves nothing.
2. **Green.** Write the minimum production code to make it pass. Not more. Resist building the
   "real" version yet.
3. **Refactor.** With the test green, improve names, remove duplication, clarify structure.
   Tests stay green throughout. This is where SOLID/DRY get applied — safely.

Repeat in small cycles. Commits happen at green.

## What to test where

- **Domain & application layers:** fast, isolated unit tests with no I/O. These are the
  majority of tests and run in milliseconds. Target ~100% *meaningful* coverage (every branch
  of a business rule), because this is where financial/regulatory correctness lives.
- **Adapters/infrastructure:** integration tests at the seam (real Postgres in a container,
  a local EVM node / Foundry, an IPFS stub). Verify the translation, not the framework.
- **Smart contracts:** Foundry unit + invariant/fuzz tests. Money and access-control paths get
  explicit adversarial tests (reentrancy, unauthorized mint/burn, compliance bypass attempts).
- **End-to-end:** a thin layer over the critical user journeys only (YAGNI — don't gold-plate).

## Test quality bar

- Test **behavior**, not implementation. Renaming a private method must not break a test.
- One logical assertion per test; descriptive names (`rejects_transfer_when_recipient_lacks_kyc`).
- Arrange–Act–Assert structure. No logic in tests (no loops/conditionals deciding the expected
  value).
- Deterministic. No real network, no wall-clock dependence, no random without a seed.
- Failure messages must point at the cause.

## Definition of Done (binding)

A unit of work is done only when ALL hold:
1. A test was written **first**, failed, and now passes.
2. Lint + typecheck + format are clean.
3. Edge cases and error paths are tested (not just the happy path).
4. No dead code; every TODO has an owner/reason or is removed.
5. Behavior was **verified by running it** and reading the output.
6. Decisions and assumptions were reported to the user.

If any item is unmet, the work is reported as *in progress* with the specific gap named. We do
not call partial work "done," and we do not move to the next step until the current one is
verified.

## Anti-patterns (rejected on review)

- Writing production code first, then "backfilling" tests to match it.
- Tests that assert on mocks' internals instead of observable behavior.
- Snapshot tests used to avoid thinking about expected output.
- Skipped/`.only`/commented-out tests left in the tree.
- Lowering a threshold or deleting an assertion to make CI green.
