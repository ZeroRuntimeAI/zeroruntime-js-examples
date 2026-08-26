# Tools

Giving the agent something to call. Function tools are built in, and the MCP
client ships with `@zeroruntime/js-sdk`; only the servers in this folder bring anything
of their own.

## mcp_example.ts

Connects to `mcp_servers/current_time.ts`, a stdio server this repo ships. The
agent spawns it as a subprocess with `npx tsx`, so the path is resolved
relative to `mcp_example.ts` rather than your working directory. Point
`MCP_SERVER` at another script to use a different one.

Nothing to configure — run it.

## Subfolders with their own setup

| Folder | Needs |
| --- | --- |
| `human_in_the_loop/` | a Discord bot — see its README |
| `n8n_workflow/` | a running n8n instance — see its README |
