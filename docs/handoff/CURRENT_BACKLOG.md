# CURRENT BACKLOG (as of `ba820fa`, 2026-08-23)

Ordered by priority. "Prerequisites" means work that must land first. Acceptance criteria are
suggestions consistent with the project's Definition of Done (failing test first, CI-green,
verified by running it).

---

## P0 — Blocking / critical

### ~~P0-1 — Issuer applications have no user interface~~ → **DONE for the review queue** (3.2f, `d0e6a71`)
An officer can now sign in and walk an application through review, approval, rejection with a
reason, suspension and reinstatement at `/[locale]/admin/issuers`, behind `issuer.manage`.
Verified live in a browser. Both follow-ups — the team panel (P1-8) and naming the deciding
officer (P1-9) — are also **DONE** as of 2026-08-23.

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
- **Attempted 2026-08-19 and REVERTED — read this before starting.** The KYC claim alone was moved
  onto the outbox (decision B7 settles the mechanism, so no design question is open there). CI
  refused it four times, and the fourth explained why: **the claim cannot go async before the mint
  can survive it.**
  - `TrexAssetTokenIssuer.mint` throws `investor <id> has no on-chain identity — the KYC claim must
    be issued first`. With the claim deferred, an approved investor can subscribe before it drains,
    and the close-time mint hits exactly that.
  - `CloseOffering` saves the closed offering, THEN captures money, THEN mints. A mint failure
    therefore leaves the offering closed and the cash taken, and re-closing is refused with
    `cannot close an offering in state "closed_success"` — no route back (**K-34**).
  - `mint` is **not idempotent**: it mints unconditionally, so a redelivered message issues tokens
    twice. Nothing today records that an allocation was minted.
- **Suggested order for the coherent slice** (one change, not four commits):
  1. Record mint-per-allocation and make it idempotent — a redelivered message must be a no-op.
  2. Move the mint onto the outbox, so it retries until the holder is registered.
  3. Decide what happens between capture and mint: money currently moves first and nothing
     reconciles the two halves. **This is a product question as much as an engineering one** and is
     worth the owner's view before it is coded.
  4. Only then move the claim — by that point its ordering dependency has dissolved.

### P0-3 — No real email delivery — **DONE** (2026-08-23)
`SmtpEmailSender` (nodemailer, approved in OD-4) sits behind the existing `EmailSender` port.
**Which provider is deployment configuration, not a code decision** — the adapter takes any SMTP
host, so OD-7 no longer blocks delivery; it only chooses where to point it.

**The default is deliberately unchanged:** with no `SMTP_HOST`, the platform keeps the dev sender
that prints `[DEV EMAIL — NOT DELIVERED]` next to every link. Silently sending nowhere is the
failure this avoids.

Send failures **propagate**, because the outbox (B7) is what makes delivery durable and it can only
retry a send that actually threw. A non-numeric `SMTP_PORT` fails loudly rather than defaulting.

Verified against a real SMTP conversation on a socket, not just mocks: `MAIL FROM`, `RCPT TO` and
the subject arrived on the wire, and the token was URL-encoded.

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
- **Done:** the portal shell and landing page (3.3e), "which organisations are mine" (3.3d), an
  issuer's view of the assets it brought (3.3f backend + 3.3g screen), an issuer **bringing** its own
  asset (3.3h — where `canWorkOnAssets()` finally decides something), and an issuer **filing the
  dossier** for it (3.3i — membership at the door, ownership in the use case, real files only).
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

### P1-8 — Issuer team panel — **DONE** (verified 2026-08-23: `issuer-detail-page.tsx` invites by email, lists email+role, removes members)
- **What:** add / list / remove an issuer's people in the browser. Endpoints exist and are tested
  (`GET|POST /issuers/:id/members`, `DELETE /issuers/:id/members/:userId`).
- **Why:** the individual-verification gate — the rule the whole phase exists to enforce — is
  currently only reachable by curl.
- **Acceptance:** an officer (or an issuer admin) invites by **email**; an unverified person is
  refused with the server's message; removing the last administrator is refused (409) and the UI
  says why; the list shows email + role, and nothing more about a person.
- **Risks:** an issuer's people list is PII. Show only what the API returns.

### P1-9 — Name the officer who decided — **DONE** (verified 2026-08-23: `issuer-views.ts` resolves `decidedByLabel`, both screens fall back to the id)
- **What:** the issuer queue prints `decidedBy` verbatim — "Decided by officer-1".
- **Why:** the project already fixed this class of thing once (`fix(notifications): human labels
  in the approval alert, not raw ids`).
- **Files:** `application/issuers/issuer-views.ts` (needs a staff-directory lookup),
  `components/admin/issuers-panel.tsx`.
- **Acceptance:** a name or email is shown; an id that cannot be resolved degrades to the id
  rather than blanking the row.

### P1-6 — Accessibility assertions — **DONE** (2026-08-23)
`e2e/a11y.spec.ts` scans the public pages, both sign-in forms and the signed-in investor portal
against WCAG 2.1 A/AA, on mobile and desktop. It runs inside the existing `test:layout` command
(`testDir: ./e2e`), so CI picked it up with no workflow change.

**Scope is deliberately WCAG A/AA only** — axe's `best-practice` tag flags judgement calls, and a
suite that cries wolf gets muted. A clean run means "no machine-detectable violation", NOT
"accessible"; axe cannot judge whether a label makes sense to a person.

**Three serious defects it found, all fixed:**
- **No page had a `<title>`** — every route, so a screen-reader user heard nothing identifying the
  page and browser history was a row of blanks. It also undercut the SEO the public catalogue was
  approved for (OD-5). Fixed with `metadata` in the locale layout.
- **The public header's "Sign in" button rendered dark slate text on its blue fill.**
  `.public__nav a` (0,1,1) outranks `.btn--primary` (0,1,0) on specificity. Visibly wrong, not just
  an axe technicality. Fixed by scoping that rule with `:not(.btn)`.
- **The home link had no accessible name on a phone**, because `.brand-text` is `display: none`
  there and the logo is `aria-hidden`. Fixed with `aria-label` on the link — a clip-rect
  visually-hidden class was tried first and tripped `layout.spec`'s own overflow guard.

**Also corrected on the way:** `--brand` was serving two roles that pull opposite ways. Measured,
brand-500 scores 5.09 as text on the dark surface but only 3.68 as a background behind white text;
brand-600 is the reverse (3.62 / 5.17). One token cannot satisfy both, so solid brand fills behind
white text now use `--brand-solid`.

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
