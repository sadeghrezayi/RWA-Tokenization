# Domain Model (Target)

Entities marked ✅ exist today (possibly under refactor), 🆕 are new. Money is always integer Rial (bigint). Every mutation appends an AuditEvent.

## 1. Tenancy & parties
| Entity | Key attributes | Notes |
|---|---|---|
| 🆕 Tenant | name, status, policyPackRef | Platform operator instance; root of scoping |
| 🆕 Organization | tenant, type (issuer/asset_owner/service_provider/platform), legal ids, status | Onboarding machine: draft→submitted→in_review→approved/rejected/suspended |
| 🆕 Membership | user, org/tenant, roles[] | Grants portal access + permissions |
| 🆕 User | email, credentials, MFA, status | Person; investors become Users with an Investor profile |
| ✅ Investor | → becomes profile of User: type (individual/entity), classification, riskProfile, suitability, agreements | KYC machine extends existing 6-state |
| 🆕 BeneficialOwner | investor/org, person data, share %, verification state | KYB requirement |
| 🆕 BankAccount | owner, iban/account no, bank, verification state | For payments in/out |
| ✅ Wallet | investor, address, derivationIndex, state (active/frozen/replaced) | Existing custodial HD wallets |
| 🆕 ServiceProvider | org with provider role: valuer/custodian/counsel/auditor/asset_manager/bank | Scoped portal access |

## 2. Assets & structuring
| Entity | Key attributes |
|---|---|
| ✅ Asset | tenant, name, type, lifecycle (proposed→in_structuring→approved→tokenized→suspended→retired), owners[], SPV ref, custody, checklist |
| 🆕 SPV | org ref, jurisdiction, registration ids, governing docs |
| 🆕 AssetOwnership | asset ↔ owner(org/person), share, evidence doc |
| 🆕 RealEstateProfile | 1:1 Asset: address, lat/lng, areas (land/GBA/NLA), yearBuilt, units, occupancy, tenancy profile, leases, GRI/opex/NOI, capRate, debt, liens, insurance, title/cadastral ids, zoning, condition/environmental refs, media |
| ✅ Valuation | asset, valuer(ServiceProvider), method, basis, dates (valuation/effective/expiry), marketValue, liquidationValue, report doc, assumptions, reviewer, machine: draft→in_review→approved→superseded/disputed; anchoredAttestation ref |
| ✅ Attestation | canonical payload, signer, hash, on-chain anchor, validity | Anchoring mechanism used by Valuation + other facts |
| 🆕 AssetPerformancePeriod | asset, period, revenue, rentCollected, opex, NOI, occupancy, arrears, maintenance, debtBalance, covenantStatus, incidents, budgetVariance |

## 3. Tokenization & offerings
| Entity | Key attributes |
|---|---|
| 🆕 TokenizationProject | asset, machine: draft→configured→simulated→approved→deploying→deployed→verified/failed; config snapshot; deploy receipts |
| 🆕 Token | project, standard (erc3643), network, addresses (suite), name, symbol, decimals, maxSupply, pause state |
| 🆕 TokenClass | token, class name, rights matrix ref, nominal value, investor classes, jurisdiction rules, limits (holding/concentration), lockup, transfer mode, policies (mint/burn/redemption/distribution/voting) |
| 🆕 RightsMatrix | ownershipForm, rightType (equity/debt/revenue_share/usufruct/other), voting/information/distribution/liquidation/redemption rights, transfer restrictions, eligibility, governing law, forum, authoritativeRecord, insolvencyPriority, source docs | Rendered in plain language for investors |
| 🆕 CompliancePolicyVersion | tokenClass, version, human-readable JSON, effectiveFrom, author, approval | Immutable versions |
| ✅ Offering | tokenClass, type (private/invite/gated_public), price, soft/hard cap, min/max, window, cooling-off, machine: draft→announced→open→(extended)→closing→closed_success/closed_failed/cancelled; termsVersion | Existing pro-rata close logic retained |
| 🆕 OfferingTermsVersion | offering, version, full terms snapshot, docs, changeNote | Material amendment ⇒ new version + notifications + re-acknowledgment |
| ✅ Subscription | offering, investor, amount/tokens, machine: draft→committed→awaiting_payment→paid→allocated/refunded/cancelled/expired; acknowledgments, signature ref |
| ✅ Allocation | subscription, requested/allocated, cost, refund | Existing |

## 4. Money
| Entity | Key attributes |
|---|---|
| ✅→ LedgerAccount | owner(party/system), type (customer_cash/escrow/issuer_payable/distribution_payable/platform_revenue/refunds_payable/fees_receivable/settlement/bank_clearing/adjustment), currency=IRR minor units | Existing accounts become customer_cash |
| 🆕 JournalEntry | id, occurredAt, description, causeRef (payment/offering/action/…), postings[] — **sum(debits)=sum(credits) enforced** |
| 🆕 Posting | journalEntry, account, direction, amount |
| 🆕 Payment | direction (in/out), party, amount, method, bankRef, machine: initiated→awaiting_payment→pending_confirmation→confirmed→matched→held/captured | failed/expired/refunded/partially_refunded/reversed/under_review; evidence docs |
| 🆕 PayoutBatch | items[], maker/checker approvals, machine, bank export ref |

## 5. Post-issuance
| Entity | Key attributes |
|---|---|
| 🆕 CorporateAction | token/asset, type (22 types incl. distribution/redemption/split/voting/buyback/…), machine: draft→in_review→approved→announced→record_date→snapshotted→executing→executed→reconciled; recordDate, snapshot ref, eligibility rules, effects |
| ✅ Distribution | becomes CorporateAction(type=income_distribution); existing snapshot + pro-rata + remainder logic retained as its executor |
| ✅ Transfer | token, from/to, tokens, mode (direct/operator_approved/…), machine incl. requested→preflight_passed→approved→submitted→confirmed/rejected(reason) |
| ✅ Redemption | machine: requested→queued→approved→burn_submitted→burned→paid / rejected; pricing = fresh valuation (existing) |
| 🆕 HolderSnapshot | token, recordDate, balances[] — from chain events (existing registry logic) |

## 6. Compliance & work
| Entity | Key attributes |
|---|---|
| 🆕 ComplianceCase | subject (investor/org/tx/wallet), type (KYC/KYB/EDD/monitoring/manual), risk, priority, owner, machine: open→in_review→pending_info→escalated→decided(approve/reject/restrict)→closed; evidence, notes, decisions with reasons |
| 🆕 ScreeningResult | subject, provider(adapter), type (PEP/sanctions/adverse_media/wallet_risk), outcome, raw ref, **mock-labeled when dev adapter** |
| 🆕 RiskAlert | source (monitoring/reconciliation/system), severity, status, linked case/task |
| 🆕 Task | assignee/queue, subject ref, due, SLA, status, comments, attachments |
| 🆕 Approval | action, payloadHash, maker, checker, status (pending/approved/rejected/expired), executedRef |
| 🆕 Notification | user, event, channel, template+locale, state (queued/sent/delivered/failed/read), deepLink |
| ✅ Document / 🆕 DocumentVersion | category, associations, version chain, machine: draft→in_review→approved/rejected→expired/superseded; hash, CID, access policy, signature/acknowledgment requirements, retention |
| ✅ AuditEvent | actor, action, subject, details, at — extended to all new scopes |

## 7. Lifecycle machines (authoritative list)
investor_onboarding · organization_onboarding · asset_onboarding · tokenization_project · offering · subscription · payment · distribution(corporate_action) · transfer · redemption · corporate_action · compliance_case · valuation · document_review — each: states, events, guards, exhaustive transition tests, backend-enforced.

## 8. Invariants (tested)
- Journal: every entry balances; account balances = Σ postings.
- held + available reconcile; captured + refunded = funded per subscription.
- Σ allocations ≤ approved supply; token supply = Σ holder balances (chain-reconciled).
- Corporate-action payouts reconcile to declared amount (existing test retained).
- Redemption pays only after confirmed burn; mint only after confirmed allocation+settlement.
- Retries never duplicate payments or mints (idempotency keys + natural keys).
