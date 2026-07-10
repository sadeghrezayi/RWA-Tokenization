# Domain Glossary

Use these exact terms in code, tests, and conversation. Consistent ubiquitous language is part
of Clean Architecture — the domain model should read like this glossary. Source:
[`docs/product-requirements.md`](../product-requirements.md).

## Core concepts

- **Tokenization** — representing the ownership or economic rights of an asset as a token on a
  distributed ledger. The token makes a claim transferable/divisible/programmable; it does not
  itself create value.
- **The three legs** — every tokenization stands on: (1) **legal right** (off-chain,
  enforceable, usually via an SPV/fund), (2) **on-chain token** (smart contracts), (3)
  **oracle/attestation** (bridges real-world state on-chain). Weakness in any leg invalidates
  the whole.
- **RWA** — Real-World Asset. The off-chain asset being represented.

## Token families (drive compliance + architecture)

- **Asset / security token** — represents ownership or economic rights in a real asset.
  Heavy regulation (securities law, KYC/AML, transfer restrictions). e.g. `ERC-3643`.
- **Utility token** — grants access to a product/service. Lighter regulation; dangerous line
  toward "security" if any yield/return is promised. e.g. `ERC-20`.
- **Stablecoin** — a settlement/payment token (a unit of money), not a yield asset.
- **NFT** — a unique, non-fungible item; may or may not be a security.

## Legal / business roles (the 9-party chain)

Asset Owner → Issuer → Tokenization Provider → Custodian → Transfer Agent → Digital Custodian
→ Secondary Market (ATS/DEX) → Distributor → End Investor.

- **SPV** — Special Purpose Vehicle; bankruptcy-remote entity holding the asset title that the
  tokens mirror.
- **Transfer Agent** — keeps the shareholder register; reports to regulators.
- **Custodian / Digital Custodian** — holds the underlying asset / the keys.

## Compliance

- **Howey Test** — US test for whether something is a security (investment of money + common
  enterprise + expectation of profit + from others' efforts).
- **KYC / AML** — Know Your Customer / Anti-Money-Laundering checks gating investors.
- **ONCHAINID** — on-chain identity contract holding signed claims; used by `ERC-3643` to gate
  transfers.
- **Claim issuer** — trusted party that signs identity/eligibility claims.

## Token standards

- **ERC-20** — fungible token; no built-in compliance (anyone can transfer).
- **ERC-1400** — security token with partitions (share classes); off-chain validation per
  transfer.
- **ERC-3643 (T-REX)** — permissioned RWA standard; compliance enforced **in the token** via
  ONCHAINID. The project's default for compliant asset tokens.
- **ERC-4626** — tokenized yield-bearing vault standard.

## Lifecycle / operations

- **Mint / Burn** — issuance / redemption of tokens.
- **Immobilize** — locking the physical/legal asset with a custodian so the token can mirror it.
- **NAV** — Net Asset Value; a key oracle-fed figure.
- **Corporate actions** — dividends, splits, redemptions executed on-chain.
- **STO** — Security Token Offering (primary issuance).
- **ATS / DEX** — secondary market venues. Secondary liquidity is the ecosystem's weakest link
  — design for it from day one.
- **"Liquidity illusion"** — tokenizing an illiquid asset does not make it liquid; cosmetic
  on-chain liquidity without real buyers is a core risk to guard against.

## Project context

- **Closed-loop / permissioned / self-hosted** — the default deployment posture (PRD §3):
  domestic, controlled, with domestic-asset settlement (no assumed access to global oracles,
  hosted custody, or USD stablecoins).
