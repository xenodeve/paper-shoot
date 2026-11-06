---
name: bot-avatars-span-is-not-canvas-scale
description: BOT_AVATAR_SPAN is 106 design units, not a size factor; baking with it froze every match start
type: feedback
---

`bot-avatars` exports `BOT_AVATAR_SPAN = 106` (the texture's span in 100-unit design space) and `BOT_AVATAR_OVERSCAN = 1.5`. `drawBotAvatarFrame(ctx, box, …)` clears and paints a **`box × OVERSCAN`** square (`n * ts` with `ts = 1.5` in the bundle). Sizing the bake canvas with `box × SPAN` made each sticker canvas ~17,808 px square: one bake took ~17 s, the game bakes 12 at match start, and React StrictMode doubles it in dev — the tab froze for minutes and even `page.reload` timed out.

**Why:** the names read like siblings; only the bundle source shows which one the painter uses. The painter itself took 3 ms — the cost was all in the oversized canvas.

**How to apply:** size any bot-avatars bake from `BOT_AVATAR_OVERSCAN` (`bakeMascot` in `src/game/textures.ts`). If match start ever stalls, time `bakeMascot` first: all 12 should finish in well under a second (247 ms measured headless after the fix, 2026-11-06). See [[headless-webgl-is-not-a-perf-signal]].
