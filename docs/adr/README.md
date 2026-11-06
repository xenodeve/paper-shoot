# Architecture Decision Records

Each ADR captures one significant, hard-to-reverse decision: its context, what was chosen, the alternatives rejected, and the consequences. They document decisions **already in the codebase** (unless marked *pending*), so a new maintainer — human or agent — can recover the *why* without re-deriving it. A decision that overturns an earlier one marks the old ADR **Superseded**.

| # | Title | Area | Status |
|---|-------|------|--------|
| [0001](0001-vanilla-three-engine-outside-react.md) | Vanilla three.js engine, React only for menus and HUD | Engine | Accepted |
| [0002](0002-ai-skills-as-refereed-dsl.md) | AI-generated skills are a refereed JSON DSL, never code | Forge | Accepted |

## Conventions

- Filename: `NNNN-kebab-title.md`, zero-padded. **Numbers must be unique** across *all* branches.
- Body: title line, a status/context bullet block, then `## Context`, `## Decision`, `## Alternatives considered`, `## Consequences`.
- Ground every claim in the code as it is **now**; cite `file:line`.
