# Open Work Ledger — consolidated single source (2026-11-06)

> **Why this file exists:** open work gets scattered across GitHub issues, ADRs, plans, and DONE.md. Agents read issues but often miss the MD. This ledger consolidates **everything still open** — GitHub-tracked **and** MD-only — into one place, deduped, with a phased plan.
> **Read this file at session start (it is linked from CLAUDE.md).** When you finish an item, update its row here AND its GitHub issue; when you discover new work, add a row here and (for anything non-trivial) file an issue so it doesn't vanish into MD again.

**Legend:** ✅ done, pending merge · 🟢 buildable now · 🟡 gated (needs merge / resource / decision) · 🔴 **UNTRACKED** (MD-only, no GitHub issue — highest miss-risk)

---

## Track 1 — Verification gaps from the first build

| Item | Status | Gate | Next action |
|---|---|---|---|
| Live AI forge round-trip with a real OpenCode Go key | 🔴 | developer's key in `.env` | Put the key in `.env`, forge one skill, check `via: "ai"` in the response |
| Voice commands with a real microphone (Chrome/Edge) | 🔴 | a human with a mic | Hold V in a match, say "reload" / "รีโหลด", confirm the command fires |
| Pointer-lock play-test by a human (feel: sensitivity, recoil, slide) | 🔴 | a human | Play three waves, note anything that feels off |
| Automated frame-time regression check | 🔴 | — | Decide whether a headless fps budget test is worth having (ADR 0001 follow-up) |

## Track 2 — Balance & content

| Item | Status | Gate | Next action |
|---|---|---|---|
| Tune skill power formulas from play data | 🔴 | play data | ADR 0002 follow-up |
| Bot accuracy / dart damage per wave | 🔴 | play-test | First automated test: 12 shots, 2 hits, 1 fold, player took no damage in ~10 s |

---

## Management Plan — phased execution order

**Phase 0 — Real-world checks.** Track 1: the AI key and the microphone are the two paths no automated test here has exercised.
**Phase 1 — Tracking hygiene.** File issues for the 🔴 rows that survive Phase 0.
**Phase 2 — Balance pass** from what the human play-test reports.

**Gating summary:** Phase 0 needs the developer (key, mic, hands on the mouse); everything after it is agent-buildable.
