// Is there a connection key for this portal — portal admin only (docs/MCP.md).
export default defineEventHandler(event => mcpKeyRoute(event, 'status'))
