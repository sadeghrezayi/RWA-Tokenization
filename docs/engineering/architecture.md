# Architecture — Clean Architecture for the Tokenization Platform

This is the binding architectural standard. It applies to every service and app. When in
doubt, the **Dependency Rule** decides.

## The Dependency Rule

Source-code dependencies point **inward only**. Nothing in an inner layer may know about an
outer layer.

```
            ┌─────────────────────────────────────────────┐
            │  Frameworks & Drivers (outermost)            │
            │  NestJS, Next.js, Flutter, PostgreSQL, EVM   │
            │  RPC, IPFS, HTTP, queues, file system        │
            │   ┌─────────────────────────────────────┐    │
            │   │  Interface Adapters                  │    │
            │   │  controllers, presenters, gateways,  │    │
            │   │  repositories (impl), mappers        │    │
            │   │   ┌─────────────────────────────┐    │    │
            │   │   │  Application (use cases)      │    │    │
            │   │   │  orchestration, ports         │    │    │
            │   │   │   ┌─────────────────────┐    │    │    │
            │   │   │   │  Domain (innermost) │    │    │    │
            │   │   │   │  entities, value    │    │    │    │
            │   │   │   │  objects, domain    │    │    │    │
            │   │   │   │  services, rules    │    │    │    │
            │   │   │   └─────────────────────┘    │    │    │
            │   │   └─────────────────────────────┘    │    │
            │   └─────────────────────────────────────┘    │
            └─────────────────────────────────────────────┘
```

### Layer responsibilities

- **Domain** — enterprise rules. Entities (`AssetToken`, `Investor`, `ComplianceRule`),
  value objects (`Money`, `WalletAddress`, `KycStatus`), domain services. **Zero** imports
  from frameworks, ORM, HTTP, or chain libraries. Pure, deterministic, fully unit-testable.
- **Application** — use cases that orchestrate the domain (`IssueAssetToken`,
  `VerifyInvestorKyc`, `DistributeRentalYield`). Declares **ports** (interfaces) for
  everything it needs from the outside (`InvestorRepository`, `ChainGateway`, `OracleFeed`).
  Depends only on the domain.
- **Interface Adapters** — implement the ports. NestJS controllers, repository
  implementations (TypeORM/Prisma), chain gateways (ethers/viem), IPFS gateways, DTO mappers.
  Translate between the outside world and use-case inputs/outputs.
- **Frameworks & Drivers** — the actual NestJS app, DB, EVM node, Next.js, Flutter. Wiring
  and configuration. As thin as possible.

## Why this matters for this platform specifically

The domain encodes regulatory and financial rules (Howey-style classification, transfer
restrictions, jurisdiction gating, yield math). Those rules **must be testable without** a
chain, a database, or a network — because they are the part that, if wrong, causes legal and
financial harm. Clean Architecture is what makes them testable in milliseconds.

The chain is **infrastructure, not the core** (PRD design principle: "blockchain is
infrastructure, not the interface"). A use case must not import `ethers`. It depends on a `ChainGateway` port; the
EVM implementation lives in an adapter and is swappable (public EVM ↔ permissioned chain),
which directly serves the Iran-context requirement of swapping networks.

## Concrete rules

1. **Dependency inversion at every boundary.** Inner layers define interfaces; outer layers
   implement them. Use-case constructors take ports, never concretes.
2. **No leaking types.** ORM entities, HTTP DTOs, and chain structs never cross into the
   domain. Map at the boundary.
3. **One reason to change per module** (SRP) — see [principles.md](principles.md).
4. **Errors are domain concepts** where they carry business meaning
   (`TransferNotCompliantError`), not raw framework exceptions.
5. **Composition root** — wiring happens in exactly one place per app (NestJS module setup /
   app bootstrap). Nothing else news up dependencies.

## Folder shape (target, when apps are scaffolded)

```
services/api/src/
├── domain/            # entities, value-objects, domain-services, domain-errors  (no deps)
├── application/       # use-cases + ports (interfaces)                           (deps: domain)
├── infrastructure/    # adapters: persistence, chain, oracle, ipfs, http         (deps: app, domain)
└── main.ts            # composition root / bootstrap
```

Tests mirror this tree. Domain and application layers target ~100% meaningful coverage because
they are pure; infrastructure is covered by integration tests at the seams.
