// Revoke the connection key of this portal (docs/MCP.md).
export default defineEventHandler(event => mcpKeyRoute(event, 'revoke'))
