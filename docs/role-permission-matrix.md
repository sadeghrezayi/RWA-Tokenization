# Role & Permission Matrix

Permissions are granular strings enforced in the application layer (guards + use-case checks + object-level ownership). Roles are templates of permissions, assigned via Membership (tenant- or organization-scoped). ✔ = full, R = read-only, M = maker only (needs checker), C = checker, — = none.

## 1. Platform roles

| Permission domain | Super Admin | Platform Ops | Compliance Analyst | Compliance Mgr | Legal Reviewer | Asset Analyst | Valuation Reviewer | Finance/Treasury | Transfer Agent | Support | Auditor | Regulator RO |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Tenant/org config | ✔ | R | — | — | — | — | — | — | — | — | R | R |
| Users & roles | ✔ | M | — | — | — | — | — | — | — | R | R | — |
| KYC/KYB queue | R | R | ✔ | ✔ | R | — | — | — | — | R | R | R |
| Case decide (high-risk) | — | — | M | C | R | — | — | — | — | — | R | R |
| Investor 360 (PII) | ✔ | R | ✔ | ✔ | R | — | — | R | R | R(masked) | R(masked) | R(masked) |
| Asset review/approve | R | R | — | — | R | ✔M | — | — | — | — | R | R |
| Valuation approve | — | — | — | — | — | M | C | — | — | — | R | R |
| Doc review | R | R | ✔ | ✔ | ✔ | ✔ | — | — | — | — | R | R |
| Token deploy | — | M | — | — | — | — | — | — | — | — | R | R |
| Token deploy approve | C | — | — | — | — | — | — | — | — | — | — | — |
| Offering publish/close | R | ✔M | — | — | R | R | — | — | — | — | R | R |
| Ledger adjustment | — | — | — | — | — | — | — | M | — | — | R | R |
| Adjustment approve | C | — | — | — | — | — | — | C* | — | — | — | — |
| Payments match/reconcile | — | R | — | — | — | — | — | ✔ | — | — | R | R |
| Payout batch | — | — | — | — | — | — | — | M | — | — | R | R |
| Payout approve | C | — | — | — | — | — | — | C* | — | — | — | — |
| Corporate action | R | M | — | — | R | R | — | R | ✔M | — | R | R |
| CA approve | C | — | — | — | — | — | — | — | C* | — | — | — |
| Transfers approve/freeze/forced/recovery | — | — | — | R | R | — | — | — | ✔M(+C* for forced/recovery) | — | R | R |
| Redemption fulfill | — | — | — | — | — | — | — | R | M | — | R | R |
| Registry/cap table | R | R | R | R | R | R | — | R | ✔ | — | R | R |
| Reports | ✔ | ✔ | ✔ | ✔ | R | ✔ | R | ✔ | ✔ | R | ✔ | ✔(scoped) |
| Audit log | ✔ | R | R | ✔ | R | — | — | R | R | — | ✔ | ✔ |
| Support (impersonation-free assist) | — | — | — | — | — | — | — | — | — | ✔ | — | — |
| System health/ops | ✔ | ✔ | — | — | — | — | — | — | — | — | R | — |

\* C* = checker must be a *different user* than maker (four-eyes), even within the same role.

## 2. Organization (issuer-side) roles
| Permission domain | Issuer Admin | Issuer Operator |
|---|---|---|
| Own org profile/team | ✔ | R |
| Own assets: create/edit drafts | ✔ | ✔ |
| Submit for review | ✔ | M |
| Own offerings: configure | ✔ | ✔ (publish requires platform approval) |
| Own investors/capital raised | R | R |
| Own distributions: propose | ✔M | M |
| Own documents | ✔ | ✔ |
| Own reports/billing | ✔ | R |
| Anything cross-org | — | — |

## 3. Service-provider scopes
valuer → assigned assets: valuations CRUD (own), docs R · custodian → custody records + confirmations · legal counsel → assigned dossiers R + review comments · asset manager → performance data ✔ for managed assets · bank/settlement partner → payment exceptions R · auditor/regulator → per §1, tenant-scoped, PII masked unless unmasked permission is explicitly granted and audited.

## 4. Sensitive actions requiring maker-checker (initial set)
token deployment · offering open/close/cancel/extend · manual journal adjustment · payout batch release · forced transfer · freeze/unfreeze · wallet replacement/recovery · redemption fulfillment above threshold · high-risk case decision · valuation approval · terms amendment publication · policy version activation · role grant of privileged roles.

## 5. Migration from today
`officer` (env credentials) maps to Platform Ops + Compliance Analyst + Transfer Agent + Finance in the dev seed **only**; production seed creates distinct users per role. Existing `investor` role becomes User+Investor profile with `investor.portal` permission set. All current endpoints get re-annotated with granular permissions in Phase 1 (behavior-preserving: current officer keeps working in dev via the composite seed role).

## 6. Enforcement & testing rules
- Deny by default; permission absence = 403 with audit event.
- Tenant scoping enforced in repositories (not controllers); object-level checks in use-cases.
- Every role gets an authorization test matrix (allowed/denied per endpoint class); four-eyes paths get dedicated tests (maker≠checker, self-approval rejected).
