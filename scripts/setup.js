#!/usr/bin/env node
/**
 * scripts/setup.js
 * Adds token-tracker-mcp to Claude Desktop config automatically.
 */
import fs from "fs";
import path from "path";
import os from "os";
import { execSync } from "child_process";

const PLATFORMS = {
  darwin: path.join(os.homedir(), "Library/Application Support/Claude/claude_desktop_config.json"),
  linux:  path.join(os.homedir(), ".config/Claude/claude_desktop_config.json"),
  win32:  path.join(process.env.APPDATA ?? os.homedir(), "Claude/claude_desktop_config.json"),
};

const configPath = PLATFORMS[process.platform] ?? PLATFORMS.linux;

let config = {};
if (fs.existsSync(configPath)) {
  config = JSON.parse(fs.readFileSync(configPath, "utf8"));
}

const binPath = execSync("which token-tracker 2>/dev/null || echo ''").toString().trim()
  || path.join(os.homedir(), ".npm-global/bin/token-tracker");

config.mcpServers = config.mcpServers ?? {};
config.mcpServers["token-tracker"] = {
  command: "node",
  args: [binPath.includes("token-tracker") ? binPath : "npx token-tracker-mcp"],
};

fs.mkdirSync(path.dirname(configPath), { recursive: true });
fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

console.log(`✅ token-tracker MCP added to Claude Desktop config:`);
console.log(`   ${configPath}`);
console.log(`\n👉 Restart Claude Desktop to activate.\n`);
