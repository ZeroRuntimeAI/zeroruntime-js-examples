# n8n workflow

The agent's tools are an n8n workflow, reached over HTTP through its MCP
trigger node. Same tools and same wire as a stdio server — different transport.

## Set up the workflow

1. In n8n, add an **MCP Server Trigger** node to a workflow.
2. Wire the tools you want the agent to call to that node.
3. Activate the workflow, then copy the trigger's URL. Test and production URLs
   differ — copy the one matching the state you activated.

## Environment

```bash
N8N_MCP_URL=https://your-n8n-instance/mcp/your-trigger-id
N8N_API_KEY=...
```

`N8N_MCP_URL` defaults to a placeholder; the example logs a warning and then
finds no tools if you leave it. `N8N_API_KEY` is optional — when set it is sent
as a `Bearer` header, so skip it only if your trigger allows unauthenticated
calls.
