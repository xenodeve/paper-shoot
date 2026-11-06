# Issue tracker: GitHub

Issues and PRDs for this repo live as GitHub issues on `xenodeve/paper-shoot`. Use the `gh` CLI for all operations.

> **`gh` path/auth:** may be missing from PATH on the developer's Windows machine — use `"C:\Program Files\GitHub CLI\gh.exe"`. Authenticated as `xenodeve`.

## Language: bilingual bodies (English + Thai)

Every issue body, PRD body, and PR description must be **bilingual**:

- **Title**: English, conventional-commit style (e.g. `fix(engine): ...`).
- **Body**: each section in English, then a mirrored Thai version — a `## สรุปภาษาไทย` section covering the whole body, or `EN / TH` paired paragraphs per section for long docs.
- **Thai must mirror English exactly** — same detail, sentence count, bullets, tables. Never summarise or omit. "สรุป" does not mean "shorter".
- Code identifiers, filenames, log excerpts, and acceptance-criteria checkboxes stay English; the Thai explains them, never translates identifiers.
- Review-reply comments may be English-only; anything a teammate reads to decide gets both languages.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --comments`.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close (with a reason)**: `gh issue close <number> --comment "<reason + evidence>"`

Infer the repo from `git remote -v` — `gh` does this automatically when run inside a clone.

## Pull requests as a triage surface

**PRs as a request surface: no.** _(Set to `yes` if this repo treats external PRs as feature requests; `/triage` reads this flag.)_

GitHub shares one number space across issues and PRs, so a bare `#42` may be either — resolve with `gh pr view 42` and fall back to `gh issue view 42`.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`.
