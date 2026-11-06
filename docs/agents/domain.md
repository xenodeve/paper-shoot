# Domain Docs

How engineering skills should consume this repo's domain documentation when exploring.

## Layout: Single-context

One `CONTEXT.md` at the root covers the whole codebase.

```
/
├── CONTEXT.md          ← domain glossary for the whole codebase (created lazily)
├── docs/adr/           ← architectural decision records
└── src/
```

(Revisit as multi-context — a root `CONTEXT-MAP.md` pointing at one `CONTEXT.md` per context, plus context-scoped `docs/adr/` — once a second package/context is added.)

## Before exploring, read these

- **`CONTEXT.md`** at the repo root — the system-context doc; the **canonical term glossary is `UBIQUITOUS_LANGUAGE.md`** (`CONTEXT.md` points at it and defers to it on any conflict).
- **`docs/adr/`** — read ADRs touching the area you're about to work in before proposing alternatives.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The producer skill (`/grill-with-docs` → `/domain-modeling`) creates them lazily when terms or decisions actually get resolved.

## Terms already fixed by the code

Until `UBIQUITOUS_LANGUAGE.md` exists, these names are load-bearing because they are identifiers or player-facing strings:

- **Bot** — an enemy: a mascot sticker card on a stand (`src/game/enemies.ts`). Not "enemy sprite", not "NPC".
- **Eraser Storm** / **ring** — the shrinking zone (`ringState` in `Game.ts`).
- **Wave** — one round of bots; cleared when every bot is folded.
- **Fold** — a kill (player-facing word).
- **Eye shot** — the critical-hit zone on a bot's face (`eyeMult`).
- **Skill**, **Tactical** (Q), **Ultimate** (Z) — player abilities; **the referee** = `balanceSkill` in `src/skills/balance.ts`.
- **Forge** — turning a player's description into a skill (`/api/forge`).

## Use the glossary's vocabulary

When your output names a domain concept (issue title, refactor proposal, hypothesis, test name), use the term exactly as defined. Don't drift to synonyms the glossary avoids. If a concept isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly instead of silently overriding:

> _Contradicts ADR-<NNNN> (<one-line decision>) — but worth reopening because…_
