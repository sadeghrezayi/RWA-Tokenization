# P1-2 — What an issuer may see about investors

**Status: PROPOSAL, awaiting the owner. Nothing here is implemented.**

The backlog's acceptance for P1-2 is: *propose an explicit field list, get it struck or extended
by the owner, then implement with a test asserting the excluded fields are absent.* This is the
proposal. Strike anything, add anything, and I will implement exactly what survives.

Why it is not my call: this is a **PII disclosure to a third party**. The owner previously answered
"all necessary information", which names a principle rather than a field list — and the difference
between those two is where privacy incidents live.

---

## What the requirement actually asks for

**FR-PT-2 (MUST)** — the issuer portal includes a *holder registry view*, alongside dossier status,
offering configuration, distribution runs and reports. So an issuer seeing *something* about the
holders of their own asset is required, not optional. The question is only which fields.

Scope note: an issuer may only ever see holders **of the assets that issuer brought**. Nothing in
this proposal changes that, and it is enforced already by the issuer/asset link (P1-1).

---

## Two findings that change the question

These came out of reading the schema rather than reasoning about it, and both matter before you
pick a list.

**1. The platform stores no investor name.** `Investor` holds `email`, `passwordHash`,
`emailVerified`, `kycState`, `kycRejectionReason`, and timestamps. There is no legal name, national
ID, address, or phone number anywhere — `legalName` exists, but on `IssuerOrganisation`, not on a
person. The backlog's own suggested starting list opens with "holder name", and **that field does
not exist**. Offering it to an issuer would mean first deciding to *collect* new identity data,
which is a larger decision than disclosing what is already held, and one with its own retention and
lawful-basis questions. I have not assumed it either way.

**2. A raw wallet address leaks across assets.** The holder registry is rebuilt from chain events,
so the natural identifier for a holder is their wallet. But a wallet is permanent and the same
address holds that investor's positions in **every other asset on the same chain** — including
assets belonging to other issuers. Handing issuers raw addresses therefore discloses more than
"who holds my asset"; it is a durable cross-asset key. The platform is permissioned and closed-loop
(PRD §3), which narrows who can exploit that, but it does not remove it.

---

## The proposed field list

### Expose — the holder registry an issuer is owed

| Field | Source | Why it is defensible |
|---|---|---|
| holder reference | derived, per asset | A stable pseudonymous handle so an issuer can track *the same holder over time* without a cross-asset key. See the open question below. |
| tokens held | chain registry | The cap table. This is the point of the screen. |
| share of supply | chain registry (`shareBps`) | Derived from the above; withholding it only forces arithmetic. |
| holder since | chain registry | When the position was first acquired. |
| tokens allocated | `offering_allocations.allocated` | The issuer ran the offering; this is its outcome. |
| amount invested | `offering_allocations.cost_rial` | The money the issuer raised, per participant. |
| allocation date | `offering_allocations.created_at` | When the allocation was settled. |
| amount refunded | `offering_allocations.refund_rial` | Over-subscription returned; an issuer reconciling a raise needs it to balance. |

### Withhold — my recommendation, and the part most worth arguing with

| Field | Source | Why I would not disclose it |
|---|---|---|
| **email address** | `Investor.email` | The only human identifier the platform holds, and a direct contact channel. Disclosing it lets an issuer approach holders outside the platform. If issuers need to reach holders, a platform-mediated message is the safer mechanism than handing over an address list. **This is the field I most expect you to overrule, and it is a legitimate call to overrule — but it should be made deliberately.** |
| **raw wallet address** | chain registry | The cross-asset key described above. |
| investor id | `Investor.id` | Internal identifier; a per-asset handle serves the issuer's purpose without becoming a platform-wide key. |
| KYC state | `Investor.kyc_state` | Every holder is approved by definition — the field carries no information for an issuer and invites inferring things about people who are not holders. |
| KYC rejection reason | `Investor.kyc_rejection_reason` | Never. Reasons why a person failed verification are not an issuer's business under any framing. |
| risk score, band, answers | `RiskAssessment` | The platform's internal assessment of a person. Disclosing it would let a third party act on a judgement the person never consented to share. |
| screening outcome / provider | `ScreeningResult` | Sanctions-screening results about a named person. Same reasoning, higher stakes. |
| email verified, password hash, timestamps | `Investor` | Account mechanics; no legitimate issuer purpose. |
| **anything about other assets** | — | An issuer sees holders of *their* asset only. Never a holder's wider portfolio. |

---

## Open questions I cannot answer for you

1. **Email — disclose or mediate?** My recommendation is to withhold and offer platform-mediated
   contact instead. If issuers have a legal obligation to maintain a shareholder register with
   contact details, that obligation outranks my recommendation — but it should be *named*, because
   it is the justification the disclosure rests on.
2. **Does an issuer need to identify holders as people at all?** If yes, that means collecting names
   the platform does not currently hold — a separate decision about what identity data is gathered
   at KYC, with its own retention questions. If no, the pseudonymous registry above is complete.
3. **Is the pseudonymous handle worth the work?** The alternative is exposing wallet addresses and
   accepting cross-asset linkability on a permissioned chain. Cheaper, and defensible — but it
   should be a decision rather than a default.

---

## What I will do once this is struck or extended

Implement exactly the surviving list, with a test that asserts every **excluded** field is absent
from the response — the backlog's own acceptance criterion, and the only kind of test that catches
a field quietly reappearing later through a shared serializer.
