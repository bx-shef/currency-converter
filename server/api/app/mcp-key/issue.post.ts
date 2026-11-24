// New connection key, shown once; the previous one stops working (docs/MCP.md).
export default defineEventHandler(event => mcpKeyRoute(event, 'issue'))
