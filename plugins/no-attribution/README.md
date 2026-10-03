# No Attribution

Removes Claude's `Co-Authored-By` commit trailer and "Generated with Claude Code" PR footer — or swaps in your own text. Unlike a CLAUDE.md rule, this is deterministic: the text is changed where Claude Code composes it.

## Install
```
/plugin marketplace add claudemodz/mods
/plugin install no-attribution@claudemodz-mods
```

## Options (`/config`)
- **Commit trailer** — text to use instead of the trailer (default: nothing)
- **Pull request footer** — text to use instead of the footer (default: nothing)

## What it can do
Hooks `attribution.text`. Makes no API calls: it cannot read files, run commands or use the network.
