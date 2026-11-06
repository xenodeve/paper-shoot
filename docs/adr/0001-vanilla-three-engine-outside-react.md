# ADR 0001 — Vanilla three.js engine, React only for menus and HUD

- **Status:** Accepted (2026-11-06) — implemented
- **Area:** Engine
- **Related:** ADR 0002; `src/game/Game.ts`, `src/game/hud.ts`, `src/ui/Play.tsx`

## Context

The game is a first-person shooter that must hold 60 fps on a mid laptop while the UI is built in React (menus, HUD, the pasted UI components). A frame does player movement, bot AI for up to ~26 bots, hitscan, pooled effects and a render. React reconciliation inside that frame, or a state update per frame, would cost far more than the game logic itself.

## Decision

1. **The engine is a plain TypeScript class** (`Game` in `src/game/Game.ts`) that owns `requestAnimationFrame`, the `WebGLRenderer`, input and the simulation. React mounts it once per run in `src/ui/Play.tsx` and disposes it on exit.
2. **The HUD reads a tiny store** (`src/game/hud.ts`, `createStore` in `src/store.ts`) that the engine writes about 15 times a second (`syncHud`), never per frame.
3. **Per-frame UI is touched directly**: the crosshair spread, the hit marker and damage numbers are DOM nodes handed to the engine as `hooks`; the minimap is a canvas redrawn at 10 Hz.
4. **The static world is one merged mesh plus one line mesh** (`src/game/world.ts`), and every effect is one pooled `InstancedMesh` (`src/game/effects.ts`). No allocation in the loop: scratch vectors live at module scope.

## Alternatives considered

- **React Three Fiber.** Rejected — ergonomic, but the loop and every entity would live in React's tree; keeping it allocation-free and out of reconciliation needs the same discipline with an extra layer in the way.
- **HUD driven by per-frame React state.** Rejected — 60+ renders a second of the HUD tree for numbers that change a few times a second.

## Consequences

- **Positive:** the frame is pure engine code; measured ~278 fps headless at render scale 1.25 during the first play-test (2026-11-06). Quality "Auto" lowers the pixel ratio when fps drops below ~52.
- **Negative / limits:** two sources of truth for HUD-shaped data (engine fields and the store snapshot); anything new on the HUD has to be added to `HudState` and `syncHud` by hand.
- **Follow-ups:** no automated frame-time regression check yet — today the HUD fps readout is the check.
