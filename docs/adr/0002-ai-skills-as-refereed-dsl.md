# ADR 0002 — AI-generated skills are a refereed JSON DSL, never code

- **Status:** Accepted (2026-11-06) — implemented
- **Area:** Forge
- **Related:** `src/skills/balance.ts`, `src/server/forge.ts`, `tests/balance.test.ts`

## Context

Players describe a skill in their own words and an AI model (OpenCode Go, OpenAI-compatible endpoint) drafts it. Two requirements pull against each other: the result must feel creative, and it must not be "too cheaty". A model told to be fair in its prompt is not a guarantee, and model output must never be able to run code in the page.

## Decision

1. **A skill is data**: a name, a slot (`tactical` / `ultimate`), a cooldown, and one to three effects from a closed list — `dash`, `heal`, `shield`, `projectile`, `area`, `buff`, `decoy`, `wall`, `reveal`, `pull` (`Effect` in `src/skills/balance.ts`).
2. **The referee** (`balanceSkill`) clamps every number into its range, spends a power budget per slot (`POWER_CAP`: tactical 40, ultimate 100) by shrinking magnitudes until the skill fits, and raises the cooldown with the remaining power. Each trim becomes a `BalanceNote` the player sees.
3. **The referee runs three times**: on the server after the model answers (`forge`), again in the browser on the response, and again when saved skills are loaded from `localStorage` (`restore` in `src/profile.ts`).
4. **The key never reaches the browser**: `src/server/forge.ts` reads `OPENCODE_GO_API_KEY` server-side (Vite dev middleware or `server/index.ts`); a per-IP limit of 12 requests a minute protects the subscription.
5. **No key, timeout or unusable answer → the offline keyword forge** (`src/skills/offline.ts`) drafts the skill, through the same referee.

## Alternatives considered

- **Let the model write effect code (JS) and sandbox it.** Rejected — sandboxing in-page code is hard to get right, and balance would still be unenforceable.
- **Trust the prompt for fairness.** Rejected — a prompt is advice; the budget is arithmetic.

## Consequences

- **Positive:** the worst a model or an edited save file can do is produce a skill at the budget cap with a long cooldown. Tested in `tests/balance.test.ts` (clamping, budget, cooldown growth, text sanitising).
- **Negative / limits:** creativity is bounded by the effect list; a new effect type needs runtime code in `applyEffect` (`src/game/Game.ts`), a power formula, a range table entry and tests — four places to keep in step.
- **Follow-ups:** the power formulas are first guesses; tune them from play data.
