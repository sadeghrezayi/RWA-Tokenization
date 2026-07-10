# Principles — SOLID, DRY, YAGNI in practice

Principles are only useful as *applied constraints*. Each below has a platform-flavored
example and a concrete test you can apply during review.

## SOLID

### S — Single Responsibility
A module has one reason to change. `IssueAssetToken` orchestrates issuance; it does not also
format HTTP responses, talk to the DB directly, or sign transactions.
- **Smell:** "and" in a class description ("validates KYC *and* mints *and* emails").
- **Test:** Could two different stakeholders request changes to this file for unrelated
  reasons? If yes, split it.

### O — Open/Closed
Open for extension, closed for modification. Adding a new compliance rule (e.g. a new
jurisdiction cap) means adding a `ComplianceRule` implementation, not editing the engine.
- **Pattern:** strategy/policy objects behind an interface; register, don't `switch`.

### L — Liskov Substitution
Any `ChainGateway` implementation (public EVM, permissioned Besu) must be substitutable
without breaking callers. No implementation may strengthen preconditions or weaken
postconditions.
- **Test:** the same use-case test suite passes against every implementation of a port.

### I — Interface Segregation
Ports are narrow and role-specific. `OracleFeed.getNav()` and `OracleFeed.getRent()` may
belong to *different* ports if consumers need only one. Don't force a class to depend on
methods it never calls.

### D — Dependency Inversion
High-level policy depends on abstractions, not details. Use cases depend on `InvestorRepository`
(interface in the application layer); TypeORM implements it in infrastructure. The arrow points
inward — see [architecture.md](architecture.md).

## DRY — Don't Repeat Yourself

One authoritative representation of each piece of knowledge.
- Domain truth lives once (e.g. the rule "transfers require a valid KYC claim" is one domain
  service, reused by issuance, secondary trade, and yield distribution).
- **But:** DRY is about *knowledge*, not *coincidental similarity*. Two pieces of code that
  look alike today but change for different reasons are **not** duplication — collapsing them
  creates coupling. Prefer a little duplication over the wrong abstraction.
- **Test:** "If this rule changed, how many places would I edit?" The answer must be one.

## YAGNI — You Aren't Gonna Need It

Build for the current, agreed requirement. No speculative generality.
- No "we might support 12 chains later" abstraction until a second chain is actually required.
  (Note: one port + one adapter today already gives us the seam — that is enough.)
- No config flags, plugin systems, or generic frameworks added "for flexibility" without a
  present, named need.
- **Test:** Can you point to a current, agreed requirement that needs this? If not, don't
  build it. Record the idea in memory or a backlog note instead.

## How these interact (the balance)

- YAGNI keeps us from over-applying SOLID into a maze of premature interfaces.
- SOLID/DI gives us the *seams* that make TDD fast.
- DRY keeps knowledge single-sourced without forcing false abstractions.

When two principles seem to conflict, resolve in this order for this platform: **correctness &
testability → clarity → DRY → extensibility.** Never trade correctness or clarity for
cleverness.
