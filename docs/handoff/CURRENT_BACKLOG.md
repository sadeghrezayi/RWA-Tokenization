# CURRENT BACKLOG (as of `9e63980`, 2026-08-16)

Ordered by priority. "Prerequisites" means work that must land first. Acceptance criteria are
suggestions consistent with the project's Definition of Done (failing test first, CI-green,
verified by running it).

---

## P0 — Blocking / critical

### ~~P0-1 — Issuer applications have no user interface~~ → **DONE for the review queue** (3.2f, `d0e6a71`)
An officer can now sign in and walk an application through review, approval, rejection with a
reason, suspension and reinstatement at `/[locale]/admin/issuers`, behind `issuer.manage`.
Verified live in a browser. **What remains, split out below:** the team panel (P1-8) and naming
the deciding officer (P1-9).

### P0-2 — Chain writes are synchronous on a single hot key
- **What:** tokenize / mint / transfer / burn / claim-issue all run inside the HTTP request using
  one operator account derived from `PLATFORM_OPERATOR_MNEMONIC`.
- **Why it matters:** a devnet hiccup turns a KYC approval or a subscription close into a 500;
  throughput is bounded by one nonce lane; and in production this is a single permanent EOA
  controlling mint/burn — which the project's own invariants forbid.
- **Files:** `services/api/src/infrastructure/chain/*`, especially `custodial-wallets.ts`.
- **Prerequisites:** the `ChainTransaction` lifecycle entity from roadmap 1.6.
- **Acceptance:** chain submission is enqueued and retried with idempotency keys; the request
  returns a pending state; the devnet fast path is preserved for tests; nonce behaviour stays
  covered by `operator-nonce.test.ts`.
- **Risks:** **high regression risk** — the nonce design took four attempts. Do not "simplify"
  `LanedOperatorSigner`; read the comments in that file and DECISION_LOG C4 first.

### P0-3 — No real email delivery
- **What:** every notification email goes to a dev sink. There is no SMTP adapter.
- **Why it matters:** password reset, email verification and KYC decisions are undeliverable, so
  no real pilot user could complete a flow.
- **Files:** `services/api/src/application/identity/email-outbox.ts`, the `EmailSender` port.
- **Prerequisites:** OD-7 — the owner must name a provider.
- **Acceptance:** a nodemailer-backed adapter behind the existing port, configured by env, with
  the dev sink still used in tests; at-least-once delivery still proven by the outbox tests.

### P0-4 — Secrets and key management
- **What:** `AUTH_TOKEN_SECRET`, `KYC_EVIDENCE_KEY`, `PLATFORM_OPERATOR_MNEMONIC` and the officer
  password hashes all come from plain environment variables. `services/api/.env` exists locally
  with dev values.
- **Why it matters:** the KYC evidence key protects passport scans; the mnemonic controls minting.
  There is no rotation, escrow, KMS or HSM (OD-16 names the target; nothing implements it).
- **Prerequisites:** an owner decision on the interim signer service.
- **Acceptance:** at minimum, documented rotation procedures and a signer that is not the API
  process. **Do not treat this as done because the values are "only dev" — the pattern is what
  ships.**

---

## P1 — Important (next milestone)

### P1-1 — Link assets to issuer organisations — **DONE** (3.3a–3.3c, 2026-08-18)
- **Delivered:** `Asset.organisationId` settled at proposal and never changed afterwards
  (`domain/assets/asset.ts`); `propose-asset.ts` refuses an organisation that may not submit
  (409 via `IssuerOrganisation.canSubmitAssets()`); `AssetView` carries `organisationId` +
  `organisationName` resolved in one batch lookup; `POST /assets` accepts the organisation; the
  onboarding screen offers only issuers that may submit, and both the asset list and the asset
  page read "Brought by <issuer>".
- **Migration:** `20260817090000_asset_issuer_organisation` — nullable, **not** backfilled, per
  `docs/data-migration-plan.md` §1 ("there is no production data yet") and OD-15. NULL means the
  platform onboarded the asset itself, which is a true answer rather than a missing one.
- **Still open (the owner's call, not an engineering one):** must every FUTURE asset belong to an
  organisation? Today "The platform" stays a valid choice.
- **Not covered here:** `IssuerMembership.canWorkOnAssets()` still has no caller — the per-person
  "may this contributor work on this asset" check belongs to the issuer-facing portal (P1-3).

### P1-2 — Decide and implement what an issuer may see about investors
- **What:** the owner answered "all necessary information"; nothing is implemented.
- **Acceptance:** propose an explicit field list (recommended start: holder name, tokens held,
  allocation date, amount invested), get it struck/extended by the owner, then implement with a
  test that asserts the **excluded** fields are absent from the response.
- **Risks:** this is a PII exposure to a third party. Do not infer the list.

### P1-3 — Issuer portal (roadmap 3.3) — **partly delivered**
- **Done:** the portal shell and landing page (3.3e), "which organisations are mine" (3.3d), and an
  issuer's view of the assets it brought (3.3f backend + 3.3g screen).
- **Remaining:** the 13-step tokenization wizard with drafts, completeness %, validation, review
  comments and status history. Large, and its scope is a **product decision** — how much of the
  wizard belongs in the first slice is the owner's call, not an engineering one.
- **Still uncalled:** `IssuerMembership.canWorkOnAssets()`. The per-person gate gets its caller when
  an issuer's own people can act on assets, which is the wizard.

### P1-4 — Officer-side gaps flagged during Phase 2
- An onboarding application waiting on the **applicant** still appears in the officer queue
  (queue counts open cases, not "waiting on us").
- A KYC-rejected applicant **cannot re-apply**; whether they should is a product question.
- CRM follow-ups have **no owner**, so reminders go to every `crm.manage` holder.

### P1-5 — Open product questions that gate design
- Should an asset be blocked from approval until its rights matrix is established?
- Should issuer staff be barred from investing?
- Should draft (unopened) offerings be visible to signed-in investors at all?

### P1-8 — Issuer team panel
- **What:** add / list / remove an issuer's people in the browser. Endpoints exist and are tested
  (`GET|POST /issuers/:id/members`, `DELETE /issuers/:id/members/:userId`).
- **Why:** the individual-verification gate — the rule the whole phase exists to enforce — is
  currently only reachable by curl.
- **Acceptance:** an officer (or an issuer admin) invites by **email**; an unverified person is
  refused with the server's message; removing the last administrator is refused (409) and the UI
  says why; the list shows email + role, and nothing more about a person.
- **Risks:** an issuer's people list is PII. Show only what the API returns.

### P1-9 — Name the officer who decided
- **What:** the issuer queue prints `decidedBy` verbatim — "Decided by officer-1".
- **Why:** the project already fixed this class of thing once (`fix(notifications): human labels
  in the approval alert, not raw ids`).
- **Files:** `application/issuers/issuer-views.ts` (needs a staff-directory lookup),
  `components/admin/issuers-panel.tsx`.
- **Acceptance:** a name or email is shown; an id that cannot be resolved degrades to the id
  rather than blanking the row.

### P1-6 — Accessibility assertions
axe-core was approved in OD-4 but no automated a11y checks exist. Add them to the Playwright run.

### P1-7 — Rate limiter is in-memory
`AuthRateLimitGuard` keeps counters per process. Behind more than one instance it is not a limit.
Move to Postgres or accept single-instance deployment explicitly.

---

## P2 — Enhancements

- **`GET /issuers/mine`** so an applicant can see their own application state (deliberately not
  built yet — YAGNI until the portal exists).
- **Invite a colleague who has no account yet** (today: 404 "no platform account"). Would need an
  invitation token flow.
- **Document versioning and per-holder access logs** for the documents centre.
- **Persistent chain indexer** instead of rebuilding the registry from events on demand.
- **fa/RTL locale pack** (OD-13, unapproved).
- **Report registry, PDF exports** (roadmap 8.1).
- **Observability**: structured logs, metrics, tracing (roadmap 8.3).

---

## Technical debt, hacks and known non-real implementations

| Item | Where | Note |
|---|---|---|
| Dev claim issuer / logging deployer | `chain/dev-log-claim-issuer.ts`, `app.module.ts` factories | Used when devnet env is absent so the API boots chain-less. Clearly labelled |
| Screening mock | (port only) | OD-11: no vendor |
| Email dev sink | `email-outbox.ts` | P0-3 |
| Ledger is single-entry | `LedgerAccount`/`LedgerEntry` | Double-entry journal is roadmap 6.1 with a parallel-run plan |
| Approval threshold placeholder | `LEDGER_CREDIT_APPROVAL_THRESHOLD_RIAL` | Requires local policy validation |
| Rights catalogue provisional | `RIGHTS_ARE_PROVISIONAL = true` | Requires local legal validation |
| Onboarding field set provisional | `application/onboarding/onboarding-form.ts` | Requires local legal validation |
| pg-boss scan is default-tenant only | `infrastructure/jobs/*` | Multi-tenant sweep deferred with OD-1a |
| Outbox drainer is in-process | `infrastructure/outbox/*` | Multi-node draining untested |
| `IssuerMembership.canWorkOnAssets()` unused | `domain/issuers/issuer-membership.ts:41` | Gets a caller with P1-1 |
| No `TODO`/`FIXME`/`HACK` markers exist anywhere in source | verified by grep | Debt is documented here instead |

## Missing tests (known)

- No automated accessibility assertions.
- No load or performance tests of any kind.
- No security tests beyond authz matrix + isolation (no fuzzing, no dependency-audit gate in CI).
- Multi-node outbox draining and multi-tenant scheduled scans are untested.
- No test asserts that PII is absent from logs.
