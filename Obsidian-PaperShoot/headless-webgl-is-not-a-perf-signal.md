---
name: headless-webgl-is-not-a-perf-signal
description: headless/automated browsers can hang or crawl on WebGL; measure the slow step before blaming the GPU
type: feedback
---

On 2026-11-06 the match start hung in headless Playwright **and** in real Chrome. The first guess was "headless WebGL is slow", which would have been wrong: timing each init step from the page (`await import('/src/game/textures.ts')` then `performance.now()` around one call) found a 17 s canvas bake in our own code within two probes ([[bot-avatars-span-is-not-canvas-scale]]).

**Why:** a hung tab looks the same whether the cause is the GPU, an infinite loop or one giant allocation; guessing picks the wrong fix.

**How to apply:** when the game hangs, open a fresh page and time init steps one at a time with a 12 s race timeout each, before changing any code. Prefer `window.__game.debugState()` (dev build) over screenshots to check a running match. A tab stuck in a long task may not recover even after navigation — close it and use a fresh one.
