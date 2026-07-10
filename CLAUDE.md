# CLAUDE.md — Tokenization Platform

Operating manual for any AI agent (and human) working in this repository. Loaded
automatically every session. The irreducible non-negotiables live in
[`.claude/core-invariants.md`](.claude/core-invariants.md) and are re-injected after every
compaction — that file is canonical; this one is the fuller manual.

---

## 1. What the Tokenization Platform is

The Tokenization Platform is an **Asset & Utility Tokenization platform**. It represents the
ownership or economic rights of real-world assets (and utility/access rights) as tokens on a
blockchain, making those claims transferable, divisible, and programmable.

The complete product requirements are in [`docs/product-requirements.md`](docs/product-requirements.md).
That document is the **source of truth for the product**; this file is the source of truth
for **how we build it**. Read the relevant PRD section before making product-shaped decisions.

**The central truth of the domain:** a token is only as good as the *off-chain enforceable
right* behind it. Every feature must trace back to one of the three legs — legal right,
on-chain token, oracle/attestation — or it does not belong.

> Deployment context note (PRD §3): the realistic starting point is a **self-hosted,
> permissioned, closed-loop** platform with **domestic-asset settlement**, focused on assets
> with a clear, transferable legal right. Keep this constraint in mind — it rules out
> dependencies on global commercial oracles, custodians, and USD stablecoins by default.

---

## 2. Non-negotiable invariants (summary — canonical copy in `.claude/core-invariants.md`)

- **TDD is mandatory.** Red → Green → Refactor. No production code before a failing test.
- **Clean Architecture.** Dependencies point inward; the domain is framework-free and
  testable without I/O.
- **SOLID, DRY, YAGNI** at every boundary.
- **No solo business decisions** — surface options + a recommendation, then wait.
- **Verify before "done"** — never report unobserved success.
- **Never settle for "good enough"** while there is room to improve.
- **One verified step at a time.**

See [`docs/engineering/`](docs/engineering/) for the detailed, example-driven version of each.

---

## 3. Engineering principles → where the detail lives

| Topic | Read |
|---|---|
| Layering, dependency rule, where code goes | [architecture.md](docs/engineering/architecture.md) |
| SOLID / DRY / YAGNI with project examples | [principles.md](docs/engineering/principles.md) |
| TDD loop + Definition of Done | [tdd.md](docs/engineering/tdd.md) |
| Tech stack + rationale + conventions | [tech-stack.md](docs/engineering/tech-stack.md) |
| Domain vocabulary (use these exact terms) | [glossary.md](docs/engineering/glossary.md) |

Do not duplicate the content of those files elsewhere (DRY). Link to them.

---

## 4. Tech stack (working set — per PRD §10)

Stack choices are partly **business decisions**: encoded here from the PRD's recommendation,
but locking in or deviating requires user confirmation. Details and rationale in
[tech-stack.md](docs/engineering/tech-stack.md).

- **Smart contracts:** Solidity on EVM. `ERC-3643 (T-REX)` + `ONCHAINID` for compliant asset
  tokens; `ERC-20` for utility tokens. Test with Foundry.
- **Backend:** NestJS + PostgreSQL. **Web:** Next.js. **Mobile:** Flutter.
- **Storage:** IPFS for immutable legal docs; PostgreSQL for metadata.
- **Custody:** self-hosted MPC + multisig. **Oracle:** internal signed-attestation feed.
- **Language baseline:** TypeScript in `strict` mode; no implicit `any`.

---

## 5. Repository structure (current — governance foundation only)

```
tokenization-platform/
├── CLAUDE.md                  # this file (how we build)
├── .claude/
│   ├── core-invariants.md     # canonical non-negotiables (re-injected on compaction)
│   ├── settings.json          # hook wiring (enforcing + advisory)
│   └── hooks/                 # hook scripts (see §7)
└── docs/
    ├── product-requirements.md# product requirements (source of truth for the product)
    └── engineering/           # architecture, principles, tdd, tech-stack, glossary
```

Application code (monorepo: `apps/`, `services/`, `contracts/`, `packages/`) is **not yet
scaffolded** — that is the next reviewed step, intentionally deferred.

---

## 6. Memory protocol

Persistent memory lives at the path in the system prompt's Memory section. The index is
`MEMORY.md` (one line per memory). Each fact is one file with frontmatter
(`type: user | feedback | project | reference`). Before saving, check for an existing file to
update; link related memories with `[[slug]]`. Do not store what the repo/git already records.

What is worth remembering here: confirmed product/scope decisions (project), user working
preferences and corrections (feedback), external references (reference). When the user makes a
decision I was not allowed to make alone, record it as a `project` memory so it survives.

---

## 7. Hooks (deterministic guardrails)

Configured in [`.claude/settings.json`](.claude/settings.json). Two enforcing, three advisory.

| Hook | Event | Type | What it does |
|---|---|---|---|
| `session-context.sh` | SessionStart (startup/resume/compact) | advisory | Injects `core-invariants.md` into context. **This is the compaction-survival mechanism.** |
| `prompt-context.sh` | UserPromptSubmit | advisory | On action-prompts, injects a one-line discipline reminder (TDD-first, verify, no solo business calls). |
| `verify-before-stop.sh` | Stop | advisory | Injects the Definition-of-Done checklist when I try to finish. Non-blocking by design (a hard block with no completion signal would trap the session). |
| `guard-bash.sh` | PreToolUse (Bash) | **enforcing** | Blocks catastrophic/irreversible commands (recursive root deletes, fork bombs, disk wipes, `curl\|sh`, force-push to protected branches). Exit 2. |
| `guard-write.sh` | PreToolUse (Write/Edit) | **enforcing** | Blocks writing real private keys / seed phrases / secrets into repo files (critical for a crypto project). Exit 2. |

Hooks are version-controlled and must themselves be testable. Each script is invocable
standalone with a JSON payload on stdin (see comments in each script).

---

## 8. Definition of Done

A unit of work is done only when **all** hold:
1. A failing test was written first, and it now passes.
2. Lint, typecheck, and format are clean.
3. Edge cases and error paths are tested.
4. No dead code; no unexplained TODO.
5. Behavior was verified by actually running it (output read).
6. Decisions and assumptions were reported to the user.

If any item is unmet, the work is reported as in-progress with the gap named explicitly.

---

## 9. Working with the user

- The user makes business/product/scope decisions. I make engineering-internal decisions and
  report them. When unsure which kind a decision is, I treat it as the user's and ask.
- I verify before claiming success, and I never describe something as finished while a
  concrete improvement remains unaddressed.
- Communication default: English throughout (product docs are English as of 2026-07-10).
