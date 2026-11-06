# Agent Workflow

How agents plan and implement in this repo, and which skills to invoke automatically.

## Development workflow

When planning or implementing a feature, follow this order:

1. **`/grill-me`** — stress-test the concept first (interview-style)
2. **`/grill-with-docs`** — challenge the plan against existing ADRs in `docs/adr/`
3. **Survey the change sites** — enumerate every place the change touches, before the plan exists
4. **`/to-prd`** — create a PRD from the grilled plan (one PRD per epic), carrying the survey as its change inventory
5. **`/to-issues`** — break the PRD into GitHub issues on `xenodeve/paper-shoot` with triage labels (one issue per deliverable)
6. **`/tdd`** — implement test-first, then make the tests pass

Hard ordering: **PRD → issues → PR**. Never open a PR without a referenced issue.

## Auto-triggered skills

| Trigger | Skill | Condition |
|---|---|---|
| Bug / error / stack trace | `/debug-mantra` | Start a debug session every time |
| After fixing a bug | `/post-mortem` | Record root cause + fix + validation |
| After writing or changing code | `/simplify` | Before committing — check over-engineering |
| Editing UI / frontend | `/impeccable` | Every time a component or CSS is touched |
| Before merge / ship | `/code-review` + `/scrutinize` | Correctness + outsider perspective |
| Touching a security boundary | `/security-review` | The AI key, `/api/forge`, rate limiting, anything model output reaches |
| After implementation | `/verify` | Confirm the feature works in the app |

## Verification mandate

Run `bun run lint && bun run typecheck && bun test && bun run build`, then play-test every frontend or engine change in a real browser (`bun dev`, the dev build exposes `window.__game.debugAimNearest()` / `debugFire()` / `debugState()`). Unit tests can't see real layout, frame rate or WebGL. Watch the HUD fps readout: an engine change that drops it is a regression.

## Commit trailer

Every pushed branch carries a `T4-Gates:` trailer on some commit (checked by `.githooks/check-gate-ledger` and CI):

```
T4-Gates: simplify=ran code-review=ran scrutinize=not-run security-review=n-a verify=ran
```

`not-run` is allowed; saying nothing is not.
