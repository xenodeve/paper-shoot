# DONE — Agent Session Log

> Newest entry on top. One dated `##` heading per shipped unit so an agent can jump to one.
> When this crosses ~a few hundred lines or a phase closes, move older entries to
> `DONE-archive-<period>.md` and leave a redirect line here.

---

## README with real gameplay + the agent forge (2026-11-06, branch `docs/20-readme-screens`)

**Goal:** #20 — the developer is about to use the game for real; the README still described the old JSON-only forge and had no pictures.

**Shipped:** five captures from a running build in `docs/screenshots/` (menu, a match, the forge mid-progress, a scripted skill with its votes, the scripted skill cast mid-match); README rewritten around the agent forge (roles, guarantees, fallback, live progress), configuration, the quota caveat before a public deploy, tests.

**Validation:** headless Chromium 1440×900 against `bun dev` with the live key. The cast is the first in-game check of a scripted skill: Q on "Pressed-Paper Aegis" raised shield 27 → 42 and started a 9.2 s cooldown, with no bot near (its no-enemies row).

**Found while capturing:** #21 (shield/heal particles burst inside the camera), #22 (long skill names overlap under Q/Z).

---

## Code skills: AI scripts, server sandbox, 5-model panel (2026-11-06, /tdd, branch `feat/18-code-skills`)

**Goal:** #18 — the AI builds the skill itself (developer: "ให้ทำใน sandbox และใช้ AI อีก 2-3 ตัวรุมตรวจ"), not only picks from ten effects.

**Shipped:** `src/skills/program.ts` (24 contexts, `skillRow`), `checkProgram` in `balance.ts`, `src/server/codeReferee.ts` (QuickJS table builder), `codeForge.ts` + `codePrompts.ts` (designer → referee → panel, rules D1–D13 / P1–P7), `opencode.ts` (shared client), Game plays the row at cast with delayed effects, Forge panel shows votes and the script. ADR 0003; CLAUDE.md rule amended.

**Validation:** `bun test` 84 pass; 14 attack scripts blocked; QuickJS absent from the client bundle (grep of `dist/assets`). Live: 2 of 3 ideas approved 5/5 through `forge()`; one designer timeout fell back to the data forge. Browser: see PR.

**Also:** real forge progress over NDJSON (plan → code → logic → review → draft), Bun idleTimeout 120, one 60 s budget, cancel on hang-up. Reviews: security-review (inherited / non-string effect types priced as NaN/Infinity — fixed), scrutinize, code-review, simplify.

**Next:** power floor + designer retry with referee feedback (ADR 0003 follow-ups); route the data forge through `chat()` (needs a `reasoning_content` fallback first).

---

## Forge reaches OpenCode Go (2026-11-06, /debug-mantra, PRs #15 + #17)

**Goal:** #14 — every forge fell back offline; #16 — approval wording.

**Root cause:** OpenCode Go needs `x-opencode-session`; without it, 400 MissingSessionID. Then intermittent 429s.

**Shipped:** session header (one per forge, shared by retries), retry on 429/5xx inside 30 s, `src/forgeReason.ts` (one busy rule for server + UI), `forge.offlineWhy.busy`; `forge.noNotes` → "อนุมัติสกิลนี้".

**Validation:** live 6/6 via AI; 33 tests; code-review + scrutinize + simplify + security-review before merge.

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
