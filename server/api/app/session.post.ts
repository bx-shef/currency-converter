// Login from the app frame: refresh_token → Bearer for the key screen (docs/MCP.md).
export default defineEventHandler(event => appSession(event))
