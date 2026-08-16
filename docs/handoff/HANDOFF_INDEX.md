# HANDOFF INDEX

**Generated:** 2026-08-16 (UTC) · **Corresponds to:** branch `main`, commit `e26f60f`
(`feat(issuers): issuer HTTP API, team management and the wiring that binds the verification gate
(P3.2e)`), CI run 31932519987 = success, working tree clean at the time of capture.

This package converts ~45 days of ephemeral development conversation into durable repository
knowledge. It is designed so a fresh engineer — or a fresh Claude session — can continue work
without the original conversation.

---

## Files

| File | Contains |
|---|---|
| **HANDOFF_INDEX.md** | This page: what exists and in what order to read it |
| **CONTINUATION_INSTRUCTIONS_FOR_CLAUDE.md** | **The most important file for an AI reader.** Mandatory startup procedure, working rules, Definition of Done, project-specific traps |
| **PROJECT_MASTER_CONTEXT.md** | What the product is, who it is for, the domain model, the product rules, and the assumptions that must not be changed casually |
| **ARCHITECTURE.md** | The architecture **as built**: layers, backend, frontend, database, blockchain, infrastructure, with a diagram |
| **IMPLEMENTATION_STATUS.md** | Brutally accurate feature inventory with evidence, files, tests and limitations |
| **DECISION_LOG.md** | Curated, categorised decision history — including what was rejected and what was abandoned |
| **REQUIREMENTS_TRACEABILITY.md** | Requirements (FR-*/NFR-* and user instructions) mapped to implementation and tests |
| **CURRENT_BACKLOG.md** | P0/P1/P2 backlog with acceptance criteria, prerequisites and risks; plus debt, mocks and missing tests |
| **KNOWN_ISSUES.md** | Every open issue, plus **resolved issues whose causes are traps** |
| **SECURITY_AND_RISK_REGISTER.md** | Risks classified Critical→Informational, and the controls that *are* in place |
| **ENVIRONMENT_AND_INTEGRATIONS.md** | Every integration (real vs mock), the complete env-var reference, and which environments exist |
| **REPOSITORY_MAP.md** | Directory-by-directory guide, security-sensitive files, and the full HTTP route inventory |
| **RUNBOOK.md** | How to install, configure, migrate, deploy contracts, run, test, reset — with real commands |
| **DEMO_GUIDE.md** | The demo surfaces, accounts, the end-to-end flow, and what cannot be demonstrated yet |
| **TEST_AND_QUALITY_STATUS.md** | Suite inventory with measured results, what the tests actually assert, flakiness, untested paths |
| **SESSION_RECOVERY_SUMMARY.md** | The dense narrative: history, milestones, decisions, failures, rejected approaches, open questions |
| **project_state.json** | Machine-readable state for tooling/AI ingestion |

## Reading order

**For a fresh Claude session (before touching code):**
1. `CLAUDE.md` and `.claude/core-invariants.md` (repository root — canonical, they override everything)
2. `CONTINUATION_INSTRUCTIONS_FOR_CLAUDE.md`
3. `PROJECT_MASTER_CONTEXT.md`
4. `ARCHITECTURE.md`
5. `IMPLEMENTATION_STATUS.md`
6. `DECISION_LOG.md`
7. `CURRENT_BACKLOG.md` + `KNOWN_ISSUES.md`
8. `REPOSITORY_MAP.md` (as a lookup, not cover to cover)

**For a human engineer joining:**
1. `PROJECT_MASTER_CONTEXT.md`
2. `RUNBOOK.md` — get it running first
3. `DEMO_GUIDE.md` + `TEST_SCENARIOS.md` (repo root) — see it work
4. `ARCHITECTURE.md` + `REPOSITORY_MAP.md`
5. `IMPLEMENTATION_STATUS.md` + `CURRENT_BACKLOG.md`
6. `SECURITY_AND_RISK_REGISTER.md`

**For the product owner:**
`SESSION_RECOVERY_SUMMARY.md` §10 (open questions), `CURRENT_BACKLOG.md`, and the append-only
original `docs/open-product-decisions.md`.

**To recover context in a brand-new AI conversation quickly:**
`SESSION_RECOVERY_SUMMARY.md` alone carries most of it; `project_state.json` gives the structured
snapshot.

## Relationship to the existing documentation

This package **does not replace** the pre-existing documentation, which remains authoritative in
its own areas:

- `docs/product-requirements.md` — the product source of truth.
- `CLAUDE.md` + `.claude/core-invariants.md` — how we build; canonical and re-injected each session.
- `docs/open-product-decisions.md` — the **append-only** decision record. `DECISION_LOG.md` here is
  a curated view of it; when they disagree, **the original wins**.
- `docs/implementation-roadmap.md` — phases 0–8.
- `docs/engineering/*` — architecture, principles, TDD, stack, glossary.
- `TEST_SCENARIOS.md` — the narrated manual demo.

## Keeping this package honest

When a material decision, architectural change or status change happens:
update `IMPLEMENTATION_STATUS.md`, `CURRENT_BACKLOG.md`, `KNOWN_ISSUES.md` and
`project_state.json` (`generated_at`), append to `docs/open-product-decisions.md`, and update the
commit line at the top of this file.
