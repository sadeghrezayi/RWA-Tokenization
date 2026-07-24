# Security Threat Model

Scope: platform (API, web, DB, IPFS), chain layer (contracts, keys, RPC), money flows, people/process. Ratings are **current exposure** in the dev pilot → **target residual** after the roadmap phase in brackets. This model is a living document; re-reviewed at every phase gate.

## 1. Trust boundaries & crown jewels
Boundaries: browser↔API (auth) · API↔DB · API↔chain RPC (operator signing) · API↔IPFS · future: API↔bank/KYC/notification providers · staff↔ops console.
Crown jewels: operator/claim-issuer keys · custodial HD seed · investor PII + identity evidence · ledger/journal integrity · holder registry integrity · legal documents · JWT/session secrets.

## 2. Threat register

| # | Threat | Current exposure | Mitigations (phase) |
|---|---|---|---|
| T1 | Administrator compromise | **High** — one env-credential officer can do everything unilaterally, but **officer TOTP MFA (opt-in) now available (1.3d)** | RBAC + least privilege (1.4), ✅ officer TOTP MFA opt-in — enrolment + login challenge + single-use recovery codes (1.3d); make mandatory for privileged roles with RBAC (1.4, OD-23), maker-checker (1.4), per-action audit (have), session hardening (1.3), privileged-role grant approval (1.4) |
| T2 | Issuer fraud (fake asset/docs) | High (no issuer role yet; ops enters data) | Issuer portal with mandatory evidence + analyst/legal review loops (3), document hash+review states (3.4), valuation independence via valuer role (4/7), disclosures marked "requires legal validation" |
| T3 | Insider abuse (staff) | **Critical** — no four-eyes | Maker-checker on sensitive set (1.4), task/queue visibility, immutable audit incl. read-access to PII (4), role separation, alerts on unusual ops (8) |
| T4 | Investor account takeover | Med — **lockout + rate limit (1.3a); httpOnly cookie sessions (1.3b); password reset (1.3c-i) + email verification (1.3c-ii) done**; MFA pending | ✅ account lockout + IP rate limit (1.3a); ✅ httpOnly cookie sessions (1.3b); ✅ self-service reset — hashed single-use tokens, no enumeration, rate-limited (1.3c-i); ✅ email verification — hashed single-use tokens, sent on registration + resend, no enumeration (1.3c-ii); officer TOTP MFA done (1.3d) — **investor MFA still to come**; security notifications (2); device/session management (later) |
| T5 | Wallet compromise (custodial seed) | **Critical** — plaintext mnemonic in `.env` on app host | Dev: keep labeled. Prod: SignerProvider → encrypted keystore/KMS/HSM (OD-16), key rotation runbook, spending policies, threshold approval for privileged ops (8) |
| T6 | Oracle/valuation manipulation | Medium — single internal attestor (seam for quorum exists) | Valuer org separation + reviewer approval (7), multi-attestor quorum port (have seam), on-chain anchoring (have), dispute state (7) |
| T7 | Document tampering | Low-Med — IPFS CID + sha256 recorded | Versioning + review states (3.4), hash verification on download (3.4), retention policy (8) |
| T8 | Double payment / duplicate credit | Medium — idempotent markPaid exists; credit endpoint unguarded | Idempotency keys (1.6), Payment natural keys + matching (6), journal balance invariant (6.1), reconciliation jobs (6.4) |
| T9 | Duplicate mint / mint without settlement | Low-Med — single close path, conservation tested; but sync + retry-free | ChainTransaction lifecycle + idempotent workers (1.6), mint-requires-confirmed-allocation invariant test (have, extended 6) |
| T10 | Payment without burn (redemption) | Low — burn-before-pay enforced + tested | Keep; add confirmed-burn (not just submitted) gate when async lands (1.6) |
| T11 | Chain reorg | Low on devnet; real on any real network | Confirmation depth config in tx lifecycle (1.6), reconciliation-required state, registry rebuild is reorg-tolerant by design (have) |
| T12 | RPC outage | High impact today — sync calls block requests | Async workers + retries + DLQ (1.6), health alerting (have probe → 8), degraded-mode UX (freshness patterns exist) |
| T13 | IPFS outage | Medium — uploads fail loudly; reads unexercised | Retry + pin redundancy, local cache, degraded banner (3.4/8) |
| T14 | Database compromise | High — PII plaintext at rest | Encryption at rest for sensitive columns (8), least-privilege DB user, network isolation, backups encrypted (8), PII log redaction (8) |
| T15 | Tenant data leakage | **Mitigated (P1.2 done)** — scoped Prisma proxy + isolation suite | Repository-enforced tenant predicate + fail-closed TenantContext + isolation test suite (✅ 1.2); object-level authz tests (1.4) |
| T16 | Privilege escalation | Med — **deny-by-default granular permission guard now enforces every endpoint (1.4a)**; still two coarse roles until multi-role split | ✅ granular `@RequirePermission` deny-by-default over all endpoints, permission catalog + role→permission map (1.4a); User/Membership multi-role split (1.4c), authz matrix tests per role (1.4d), privileged grants behind approval (1.4), maker-checker on sensitive set (1.4b) |
| T17 | Malicious file upload | Medium — base64 docs accepted, no scanning | Size/type limits, malware-scan port with labeled dev no-op (3.4), never serve untransformed user files from app origin, CSP (8) |
| T18 | Incorrect valuation → mispriced redemption | Medium — freshness enforced, single approver | Reviewer approval + four-eyes (7), dispute flow, redemption threshold approvals (5.4) |
| T19 | Erroneous corporate action | Medium — distribution declare/pay is 2-step but same role | CA machine with review+approval+record-date preview (7), reconcile step, reversal runbook |
| T20 | Reconciliation divergence (DB vs chain vs bank) | Medium — registry reconciliation exists on-demand only | Scheduled reconciliation jobs + break alerts + exception queue (6.4), supply/holder invariant in CI (6) |
| T21 | XSS / CSRF / injection | Low — React escaping + Prisma params; **httpOnly session cookie (XSS can't read JWT) + double-submit CSRF done (1.3b)**; CSP/headers pending | ✅ httpOnly cookies + double-submit CSRF (1.3b); CSP + security headers (8); dependency audit gate (8); input validation layer present |
| T22 | SSRF | Low — no user-supplied URL fetches today | Guard rule for future adapters: allowlist + no redirects (8) |
| T23 | Secrets in repo/logs | Guarded — enforcing hooks block secrets; env gitignored | Keep hooks; secrets manager for prod (8), structured logs with redaction (8) |
| T24 | Replay/webhook forgery | N/A yet | Idempotency + signature verification standard for all future webhooks (6+) |

## 3. Chain governance gap (headline)
Today a **single EOA** is: token agent (mint/burn/forced ops), claim issuer, suite deployer, and attestation anchor sender. Target (OD-10, Phase 8 with design earlier): role separation across keys → threshold scheme or contract multisig for AgentRole/OwnerRole, timelocked configuration changes, pausability runbook, emergency procedures (pause → assess → communicate → remediate), documented key ceremonies (FR-CU-3). Until then, production deployment is **blocked by policy** — recorded as an explicit gate in the readiness assessment.

## 4. Non-negotiable security rules going forward
No plaintext production keys in app processes · no single permanent EOA controller · deny-by-default authz · four-eyes on the sensitive-action set · PII never in logs · money/token mutations idempotent · every privileged action audited · fake screenings/compliance always labeled as mock · jurisdiction rules configurable and marked "requires local legal validation".

## 5. Incident response & recovery (Phase 8 deliverables)
Incident classification + on-call path · pause procedures per subsystem (token pause, offering halt, payout freeze) · key-compromise playbook (rotate, re-issue claims, registry rebuild from chain) · backup/restore drills (DB + IPFS pinset) · DR targets (RPO ≤ 24h dev, defined per env) · post-incident review template.
