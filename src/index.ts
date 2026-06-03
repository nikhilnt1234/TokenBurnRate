#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTools } from "./tools/index.js";
import { initDb } from "./db/database.js";

const server = new McpServer({
  name: "token-tracker",
  version: "1.0.0",
  description: "Track, analyse, and budget LLM token usage across sessions and models",
});

async function main() {
  await initDb();
  registerTools(server);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Token Tracker MCP running on stdio");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
