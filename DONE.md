# DONE — Agent Session Log

> Newest entry on top. One dated `##` heading per shipped unit so an agent can jump to one.
> When this crosses ~a few hundred lines or a phase closes, move older entries to
> `DONE-archive-<period>.md` and leave a redirect line here.

---

## Aim-down-sight overlays for every gun (2026-11-06, /karpathy-guidelines, branch `fix/8-sights`)

**Goal:** #8 — aiming with the Ruler Rifle hid the gun and the crosshair and showed nothing; the developer also asked for a sight on every gun.

**Shipped:** `Sight` overlay in `src/ui/Play.tsx` (rolled-paper scope with ruler ticks for the rifle; ring, holo corners and spread ring for pencil, stapler and punch), driven by `--ads` / `data-weapon` written by `updateDomHooks` in `src/game/Game.ts`; the aimed viewmodel sits lower and further out so it no longer covers the skills bar.

**Validation:** headless Chromium, each gun held at full aim: its own sight at opacity 1, the others at 0, crosshair 0; ruler shows the scope at 1 with the viewmodel hidden. Screenshots checked for ruler and stapler.

---

## Loot toasts (2026-11-06, /tdd, branch `feat/3-loot-toasts`, PR #6)

**Goal:** #3 — tell the player what a crate gave them.

**Shipped:** `src/game/toasts.ts` (pure `pickupToast`), toasts in the HUD store, bottom-centre stack in `Play.tsx`; a gun toasts when it drops, everything else when actually gained.

**Validation:** `tests/toasts.test.ts` red → green (5 tests); browser: a gold crate produced five toasts with amounts, E on the dropped gun toasted "Got the Hole Punch".

---

## Rapid-fire stutter: shader warm-up (2026-11-06, /debug-mantra + /simplify, branch `fix/4-rapid-fire-stutter`, PR #5)

**Goal:** #4 — the view stuttered when clicking fire rapidly.

**Root cause:** shader programs compiled on first draw; on Windows/ANGLE that is a D3D compile per program. One shot grew `renderer.info.programs` 14 → 18 mid-match. Headless never showed it (SwiftShader compiles fast).

**Shipped:** `warmShaders()` with `renderer.compileAsync` behind a new loading card; shared material factories (`cardMaterials`, `puddleMaterial`, `shockMaterial`) so warm-up cannot drift from spawn sites.

**Validation:** real Chrome (RTX 4070 SUPER, D3D11): programs fixed at 21 from the ready card through firing, kills, skills and bot darts; no Long Animation Frame over 50 ms. Nine-run debug ledger in the PR.

**Next:** Track 0 rows in the ledger (renderer reuse across runs; unattributed 32–36 ms frames).

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
