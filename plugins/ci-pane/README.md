# CI Pane

Your pull request's checks, live, beside the transcript.

- `/ci` opens the pane: every check with ✓/✗/•, a link to the PR, **Refresh** and **Re-run failed** buttons.
- A status line appears under the prompt only while something is failing, and you get a toast when checks start failing or all pass.
- `/ci rerun` re-runs failed jobs from anywhere, including surfaces that don't draw panes.

Requires the [GitHub CLI](https://cli.github.com) signed in (`gh auth login`).

## Install
```
/plugin marketplace add claudemodz/mods
/plugin install ci-pane@claudemodz-mods
```

## Options (`/config`)
- **Refresh interval** — seconds between checks (default 30, minimum 10)

## What it can do
Runs `gh pr view` and `gh run rerun` (`$.process.run`), polls on a timer, and draws a pane, toasts and a status line. It does not read or write files or make other network calls.
