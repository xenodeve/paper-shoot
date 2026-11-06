# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual label strings used in this repo's issue tracker.

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation            |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label string from this table.

## T4 groups (the delta on top of the five roles)

- **Component** — exactly one per issue: `engine` (three.js loop, world, bots, weapons, effects), `ui` (React menus, HUD, panels), `forge` (AI skill forge, referee, `/api/forge`), `voice` (speech commands), `infra` (build, CI, hooks, server).
- **Type** — one or more: `Bug`, `Feature`, `tech-debt`, `security`, `Optimization`, `Cleanup`, `Test`.
- **Severity** — one per Bug/Security: `critical`, `Major`, `Minor`.
- **Lifecycle** — `Latent` (exists in code, not yet manifested), `Dormant` (real but deprioritised).

## Conventions

- Every issue has ≥1 triage-state label and exactly one component label.
- A `security` issue must carry `critical` or `Major` — a `Minor` security label is not valid.
- A `Latent` bug that activates is upgraded to a full Bug issue with severity.
- The labels exist on `xenodeve/paper-shoot` (created with `gh label create` at bootstrap, 2026-11-06). A documented label that is missing on GitHub is a defect: create it.
