# Standup

Never write a standup from memory again. Standup keeps a tiny log of what you asked Claude to do and which files changed — across every session on your machine — and `/standup` turns it into your update.

- `/standup` — today · `/standup yesterday` · `/standup week`
- The log stays on your machine (Claude Code's plugin store) and keeps 14 days by default.
- No model call per turn: the model is used only when you run `/standup` (Haiku by default).

## Install
```
/plugin marketplace add claudemodz/mods
/plugin install standup@claudemodz-mods
```

## Options (`/config`)
- **Model** — which model writes the update (default `haiku`)
- **Keep log for** — days of history (default 14)

## What it can do
Reads your prompts and which files Claude edits, reads `.git/HEAD` for the branch name, stores the log with `$.store`, and calls the model when you run `/standup`. It does not run commands or use the network beyond that model call.
