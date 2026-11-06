# Paper Shoot

A first-person arena shooter set on a desk. Bots are paper cut-out mascots on stands, the arena is a notebook page with stationery for cover, and an Eraser Storm closes the ring each wave. Score Attack: survive the waves, fold as many bots as you can, chase the leaderboard.

## Run it

```sh
bun install
bun dev            # http://localhost:5173 — game + AI forge API in one process
bun test           # skill referee + voice parser
bun run build && bun start   # production: Bun serves dist/ and the API on :4173
```

Keyboard and mouse, desktop Chrome/Edge (voice commands use the Web Speech API).

## AI Skill Forge (OpenCode Go)

Copy `.env.example` to `.env` and set `OPENCODE_GO_API_KEY`. The key is read by the server only (Vite dev middleware or `server/index.ts`) and never reaches the browser bundle.

- Endpoint: `https://opencode.ai/inference/go/openai/v1` (OpenAI-compatible); `OPENCODE_GO_MODEL` picks the model (default `glm-5.3-flash`).
- The model may only answer with a small JSON DSL: up to 3 effects from a closed list (dash, heal, shield, projectile, area, buff, decoy, wall, reveal, pull).
- **The referee** (`src/skills/balance.ts`) clamps every number into range, spends a power budget per slot (tactical 40, ultimate 100), shrinks anything over budget, and raises the cooldown with power. Every trim is shown to the player. It runs on the server, again in the browser, and again when saved skills are loaded, so an edited `localStorage` can't smuggle in a god skill.
- No key, timeout or bad answer → a local keyword forge (Thai + English) drafts the skill instead, through the same referee.

## Controls

| | |
|---|---|
| WASD / Space / Shift | move / jump / sprint |
| C or Ctrl | crouch; while sprinting: slide |
| LMB / RMB | fire / aim |
| R | reload |
| E | open crate / pick up weapon |
| Q / Z | tactical / ultimate skill |
| H | heal (tape → shield, glue → health) |
| G or MMB | ping |
| 1–4, wheel | weapons |
| V (hold) | voice command: reload · heal · skill · ultimate · switch · ping · pause (TH or EN) |
| Esc | pause |

## Performance notes

- React never renders inside the frame. The engine (`src/game/Game.ts`) owns the loop; the HUD store updates at 15 Hz; crosshair, hit marker and damage numbers are DOM nodes touched directly.
- The whole static map is one merged mesh plus one ink-outline line mesh. Particles, decals, tracers, darts and skill balls are each one `InstancedMesh` with a fixed pool. No allocation in the loop.
- No shadow maps, no post-processing, toon materials, fog-limited far plane.
- Quality "Auto" lowers the render scale when fps drops below ~52 and raises it back above ~75. The fps and scale show in the HUD.

## What's original here

Genre mechanics (shrinking ring, shield + health, loot crates, slide) are shared with the battle-royale genre; names, weapons, bots, art and UI are this game's own: Pencil Pistol, Stapler SMG, Hole Punch, Ruler Rifle, the Eraser Storm, the mascots from `bot-avatars`.
