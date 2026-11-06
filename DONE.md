# DONE — Agent Session Log

> Newest entry on top. One dated `##` heading per shipped unit so an agent can jump to one.
> When this crosses ~a few hundred lines or a phase closes, move older entries to
> `DONE-archive-<period>.md` and leave a redirect line here.

---

## First playable build + T4 bootstrap (2026-11-06, /karpathy-guidelines + /t4-project-bootstrap, branch `main`)

**Goal:** a paper-craft first-person arena shooter (Score Attack) with bot-avatars mascots, an AI skill forge on OpenCode Go with a balance referee, TH/EN UI, voice commands, and the developer's pasted UI components — performance first.

**Shipped:**
- `src/game/*` — vanilla three.js engine (ADR 0001): merged paper world, sticker-card bots with accessories, 4 stationery weapons, Eraser Storm ring, waves, crates, supply drops, pings, minimap, pooled effects, synthesized audio.
- `src/skills/*`, `src/server/forge.ts`, `server/index.ts` — skill DSL + referee (ADR 0002), OpenCode Go proxy, offline forge.
- `src/ui/*` — menu (BranchedMenu, FlyingButton), Forge (ThinkingOrb, ThoughtLine, LatticeLoader, VoicePill), Library (PulseHeart), Locker (mascot accessories), Leaderboard, Settings, HUD, Game Over.
- T4 Seed layer: `CLAUDE.md`, `docs/agents/*`, `docs/adr/*`, this log, the ledger, `Obsidian-PaperShoot/`, `.claude/` hooks, `.githooks/`, `.github/workflows/`.

**Validation:** `bun test` 9 pass / 0 fail; `tsc -b` exit 0; `oxlint` exit 0 (warnings only, mostly in the pasted components). Headless Chromium play-test: menu → Drop in → match starts, wave 1 spawns, auto-aimed fire folded a bot (score 199), ~278 fps, no page errors.

**Report:** the start-of-match freeze (mascot bake) — see `Obsidian-PaperShoot/bot-avatars-span-is-not-canvas-scale.md`.

**Next:** Track 1 of `docs/OPEN-WORK-LEDGER.md` (live AI key, real microphone, human play-test).

---
