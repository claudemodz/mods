# Model Router

Sends routine subagents to cheaper models and lets you switch the main session's model in one command.

- **Subagents:** by default, `Explore` subagents run on Haiku. Configure any `agentType=model` pairs in `/config`. A model Claude chooses explicitly, and forks, are never changed.
- **`/router fast | smart | off`:** sets the main session's model for following requests (defaults: Sonnet / Opus / unchanged). The spinner shows the active preset model.

> Switching the main model mid-conversation restarts the prompt cache, which can cost more for a turn or two. That's why presets are manual, not automatic.

## Install
```
/plugin marketplace add claudemodz/mods
/plugin install model-router@claudemodz-mods
```

## What it can do
Hooks `agent.spawn`, `turn.step`, `ui.render` (spinner), `command.run`, `session.start`. Calls `$.command.register`, `$.ui.invalidate`. It changes which model requests use; it can't read files, run commands or use the network.
