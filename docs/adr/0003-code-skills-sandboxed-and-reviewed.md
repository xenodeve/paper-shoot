# ADR 0003 — AI-written skill scripts, sandboxed on the server, reviewed by a model panel

- **Status:** Accepted (2026-11-06) — implemented in #18
- **Area:** Forge
- **Amends:** ADR 0002 ("Alternatives considered: let the model write effect code" — now taken, in a form that keeps 0002's guarantees)
- **Related:** `src/skills/program.ts`, `src/skills/balance.ts` (`checkProgram`), `src/server/codeReferee.ts`, `src/server/codeForge.ts`, `src/server/codePrompts.ts`, `tests/program.test.ts`, `tests/code-referee.test.ts`, `tests/code-forge.test.ts`

## Context

Data skills (ADR 0002) pick one to three of ten fixed effects, so most forged skills feel alike. The developer asked for the AI to build the skill itself, run it in a sandbox, and have several models check it (2026-11-06). 0002 rejected AI code because in-page sandboxing is hard and balance unenforceable. A spike measured both problems away by moving the code off the page and pricing every case it can reach.

## Decision

1. **The AI writes a script, the game never runs it.** A designer model writes `function onCast(api, ctx)`; `api.*` is the existing ten effects plus `api.after(sec, fn)`; `ctx` is four discrete facts (`hpLow`, `shieldUp`, `enemiesNear` 0/1/3, `hitRecently`) — 24 contexts in all.
2. **The referee is code, on the server** (`codeReferee.ts`): the script runs in QuickJS (WASM) once per context with no host functions, `Date` and `Math.random` removed, every built-in and its prototype frozen (not the global object, where `onCast` is declared), and 50 ms / 4 MB / 12 effects / 4 `after` limits. What comes out is an **effect table**: 24 rows of timed effects, i.e. data.
3. **The table is refereed like a data skill, everywhere** (`checkProgram` in `balance.ts`): every effect type checked as an own key (an inherited name like `constructor` would price as NaN — found by security-review), every effect clamped to its range, any number outside 0–`MAX_NUMBER` (1000) rejected, any non-finite row power rejected, every row on its own within the slot budget, cooldown priced from the worst row. It runs on the server, again in the browser, and again on load from storage — so 0002's three-pass rule holds unchanged.
4. **A five-model panel adds vetoes, never permission** (`codeForge.ts`): `glm-5.3-flash`, `deepseek-v4.1-flash`, `gpt-5.6-luna`, `mimo-v2.6-flash`, `muse-spark-1.3-contributor`, in parallel, each with a lens (safety, red team, counterplay, hidden spikes, fidelity). At least 3 usable votes, and any reject rejects. The rules each party works under are the prompts in `codePrompts.ts`, ids D1–D13 (designer) and P1–P7 (panel).
5. **Progress is real, not a timer:** with `accept: application/x-ndjson` the forge streams its stages as they happen — `plan` (designer writing NAME/DESC), `code` (the moment its code block opens, read from the streamed reply), `logic` (the 24-context run), `review` with each vote as it lands, `draft` on fallback. The trickle of lines also keeps a slow forge alive; the Bun server sets `idleTimeout: 120` (its 10 s default would drop a forge).
6. **The game plays the row for the moment of the cast** (`skillRow` + `ctxFrom`), delayed effects on a timer. No AI code exists in the browser bundle.
7. **Anything short of approval falls back to the data forge** (ADR 0002). The whole forge, fallback included, stays within 60 s. Off switch: `PAPER_SHOOT_CODE_SKILLS=0`.

## Alternatives considered

- **Run the script in the browser (Worker / sandboxed iframe).** Rejected — the table makes it unnecessary, keeps WASM out of the client, and a hostile script cannot stall a frame because none runs there.
- **Sample contexts instead of enumerating them.** Rejected — a script can hide a spike in one case; 24 discrete contexts are priced exactly.
- **A JSON branch format instead of a script** (`{branches:[{when, effects}], after:[…]}`), with the two fairness rules as deterministic checks and one fidelity reviewer — raised by scrutinize on PR #19. Same expressiveness for 4 discrete facts, no WASM, fewer model calls. Not taken because the developer asked for AI-written code in a sandbox; the output of both is the same effect table, so switching later touches only the server side.
- **Majority vote.** Rejected — measured: the same over-budget script got 2 passes and 2 rejects in one round at temperature 0.

## Consequences

- **Positive:** skills branch on the situation and chain over time, still bounded by the same arithmetic. 14 attack scripts are blocked in `tests/code-referee.test.ts`. Live (2026-11-06): 2 of 3 ideas approved 5/5 end to end.
- **Negative / limits:** a forge is slower (20–35 s, mostly the designer); `buildTable` runs 24 synchronous QuickJS evaluations on the server thread (≤ 50 ms each, so ≤ 1.2 s worst case per forge); OpenCode Go 429s and the slowest reviewer can cost the quorum. The script can still only combine the ten effects — a genuinely new mechanic is still engine code.
- **Follow-ups:** a power floor (measured skills at 6/40 read as nothing); designer retry with the referee's verdict as feedback; a typed provider error instead of the `http-<status>` string.
