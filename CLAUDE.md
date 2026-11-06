# CLAUDE.md — Paper Shoot

Agent operating manual. The coding agent is the primary developer of this repo; this file and the docs it points at are its working memory.

## North star

A first-person arena shooter set on a desk, made of paper: cut-out mascot bots, stationery weapons, a shrinking Eraser Storm, Score Attack waves. **High craft and steady frame rate beat feature count.** Every feature must hold 60 fps on a mid laptop and read as paper.

## Standing defaults

- **`using-t4` is the standing default, not a pointer.** Route every task through it before acting, and **re-route at every phase boundary**: after writing code → `simplify`; editing UI/CSS → `impeccable`; before merge → `code-review` + `scrutinize`; touched the AI key, the `/api/forge` endpoint or anything else crossing a trust boundary → `security-review`; done → `verify`. **A check at task start does not discharge a later trigger.**
- **`karpathy-guidelines`** for every edit: simplest thing that works, surgical diffs, verifiable success criteria.
- **`t4-bro`** for everything the developer reads: plain Thai, identifiers in English.
- **Delegation via `clink`: not used in this project** (developer's decision, 2026-11-06). `clink-subagents` and `clink-masteragent` are deliberately not wired.
- **Companion ecosystems:** superpowers, matt pocock (`setup-matt-pocock-skills`, `to-prd`, `to-issues`, `triage`, `grilling` — installed under `~/.claude/skills` / `~/.agents/skills`) and 9arm (`debug-mantra`, `scrutinize`, `post-mortem`) are all present on the developer's machine (checked 2026-11-06).

## Session-start read protocol

1. `Obsidian-PaperShoot/Home.md` — skim, open only the notes the task touches.
2. `docs/OPEN-WORK-LEDGER.md` — open work; 🔴 rows are untracked and easiest to lose.
3. The GitHub issue you are picking up: `gh issue view <n> --comments`.
4. `DONE.md` / `docs/adr/` only when the task needs history or a past decision.

## Session end

Report each `xeno-skills` rule that did not hold as a `skill-feedback` issue on `xenodeve/xeno-skills` (search `--state all` first, comment instead of duplicating, always pass `--repo`). See `t4-agent-memory`.

## Repo layout

```
src/
  game/            the engine — vanilla three.js, no React inside the frame
    Game.ts        loop, player, weapons, bots AI, skills runtime, ring, score, HUD sync
    world.ts       the Desk map: ONE merged mesh + ONE ink-outline line mesh
    collision.ts   boxes + cylinders on a grid; movement resolve + raycasts
    enemies.ts     bot kinds, wave roster, sticker-card meshes
    effects.ts     pooled InstancedMesh effects (particles, decals, tracers, darts)
    textures.ts    procedural paper textures + mascot sticker bake (bot-avatars)
    weapons.ts     weapon stats + first-person models
    audio.ts       synthesized WebAudio SFX
    hud.ts         HUD store contract (engine writes ~15 Hz)
  skills/balance.ts  skill DSL + the referee (power budget). Shared server/client.
  skills/offline.ts  keyword forge when no AI is reachable
  server/forge.ts    /api/forge handler (OpenCode Go), used by vite dev + Bun server
  ui/              React: Menu, panels/*, Play (HUD), GameOver, components/*
  voice.ts         Web Speech API + command parser
server/index.ts    production Bun server (dist/ + /api)
tests/             bun test suites
```

## Commands (Bun is the package manager — `bun.lock` is committed)

| | |
|---|---|
| `bun install` | dependencies |
| `bun dev` | dev server on :5173 with the forge API built in |
| `bun test` | unit suites |
| `bun run lint` · `bun run typecheck` · `bun run build` | the rest of the fast gate |
| `bun start` | production server on :4173 (after `bun run build`) |

`bun` may be missing from PATH on this machine: use `"$USERPROFILE/.bun/bin/bun.exe"`. Same for `gh`: `"C:\Program Files\GitHub CLI\gh.exe"`.

## Enforcement that is actually installed

- **Claude hooks** (`.claude/settings.json` + `.claude/hooks/`, marker `.claude/t4.json`): session-start injects `using-t4`; `t4-gate` denies `gh pr create` without an issue reference and dangerous git, and runs `verify` before `gh pr merge`.
- **Local ship gate:** `.claude/t4.json` `"verify"` = `bun run lint && bun run typecheck && bun test && bun run build` — a literal prefix of CI.
- **Git guards** (`.githooks/`): issue reference, tree budget, `T4-Gates:` trailer. Enable per clone: `git config core.hooksPath .githooks`.
- **CI** (`.github/workflows/t4-verify.yml`): `lint`, `typecheck`, `test`, `build` are required checks on `main` through the ruleset "T4 main gate"; direct pushes to `main` are blocked. CodeQL + Dependabot run on top.

## Hard rules for this codebase

- **Performance budget is a feature.** No allocation in the frame loop (reuse scratch vectors), no new draw call per entity where an `InstancedMesh` pool fits, no shadow maps or post-processing. Check the HUD fps readout after any engine change.
- **AI output is data, never code.** Anything from the model goes through `balanceSkill` on the server **and** again in the browser **and** again when loaded from storage. Never widen the effect list or a range without updating `tests/balance.test.ts`.
- **The OpenCode Go key lives only on the server** (`.env`, read by `src/server/forge.ts`). Never a `VITE_*` variable, never in client code.
- **Original IP only.** Genre mechanics are fine; no names, characters, weapons or UI copied from an existing game.
- **TH/EN:** every user-facing string goes through `src/i18n.ts`, both languages.
- **Verify frontend changes in a real browser** — the dev build exposes `window.__game` (`debugAimNearest`, `debugFire`, `debugState`) for automated play-tests.

## Writing conventions

- Chat and reports to the developer: Thai (`t4-bro`). Code, comments, commit messages: English.
- **GitHub tracker bodies are bilingual** — issue, PRD and PR bodies in English plus a full Thai mirror of the same depth. Titles in English, conventional-commit style. See `docs/agents/issue-tracker.md`.
- **PRD → issues → PR.** Never a PR without a referenced issue. TDD for features and bugfixes.

## Agent skills

### Issue tracker

GitHub Issues on `xenodeve/paper-shoot`, via `gh`. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles plus T4 Type / Component / Severity groups. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: root `CONTEXT.md` (created lazily) + `docs/adr/`. See `docs/agents/domain.md`.

### Workflow

grill → PRD → issues → TDD, plus auto-triggered skills. See `docs/agents/workflow.md`.
