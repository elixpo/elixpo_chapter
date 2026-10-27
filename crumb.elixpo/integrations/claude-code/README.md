# Crumb for other agents

This plugin lets another coding agent use Crumb. It adds:

- the `crumb` MCP server (`crumb mcp serve`), whose `crumb_agent` tool hands
  Crumb a whole task, alongside Crumb's individual tools;
- the `crumb` skill, which tells the agent when to delegate to Crumb and how to
  check the result.

The plugin does not install Crumb itself. Install the `crumb` binary first
(see the [install instructions](../../README.md#install)) and sign in with
`crumb auth login` or set `POLLINATIONS_API_KEY`.

## Claude Code

```text
/plugin marketplace add elixpo/crumb.elixpo
/plugin install crumb@elixpo
```

## Other agents

`skills/crumb/SKILL.md` follows the open [Agent Skills](https://agentskills.io)
format, so agents that load skills can use it directly: copy the
`skills/crumb` folder into that agent's skills directory. For MCP, point the
agent at a stdio server that runs `crumb mcp serve` in the workspace. Without
MCP, the skill falls back to `crumb exec --json`.

Each delegated task spends the user's Pollinations credit, and Crumb's tools
follow the user's `.crumb/agent.json` permissions. See
[docs/development/mcp-boundary.md](../../docs/development/mcp-boundary.md).
