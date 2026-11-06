---
name: opencode-go-endpoint
description: OpenAI-compatible base URL and how the key is supplied
type: reference
---

- **Base URL:** `https://opencode.ai/inference/go/openai/v1` (OpenAI-compatible `/chat/completions`). Found in opencode's local models cache (`~/.cache/opencode/models.json`, provider `opencode-go`) on 2026-11-06. Some Go models use the Anthropic or Google endpoints under the same host instead — pick an `@ai-sdk/openai-compatible` one (default `glm-5.3-flash`).
- **Key:** `OPENCODE_GO_API_KEY` in `.env`, read only by `src/server/forge.ts`. The developer's opencode install already holds a key for provider `opencode-go`; it is not copied into this repo.
- **Fallback:** without a key the forge drafts skills offline (`src/skills/offline.ts`), so the game never depends on the API.

See [[developer-preferences]].
