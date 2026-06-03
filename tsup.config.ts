import { defineConfig } from "tsup";

const sharedConfig = {
  format:    ["esm"] as const,
  sourcemap: false,
  splitting: false,
  shims:     false,
  target:    "node20" as const,
  outDir:    "dist",
  // Mark native modules and node builtins as external - never bundle them
  external: [
    "better-sqlite3",
    "node:sqlite",
    "node:fs",
    "node:path",
    "node:os",
    "node:module",
    "node:process",
    "fs", "path", "os", "module", "process", "util",
  ],
  noExternal: [],
};

export default defineConfig([
  // ── MCP server ─────────────────────────────────────────────────────────────
  {
    ...sharedConfig,
    entry:   { index: "src/index.ts" },
    dts:     true,
    clean:   true,
  },
  // ── CLI ─────────────────────────────────────────────────────────────────────
  {
    ...sharedConfig,
    entry: {
      "cli/index":      "src/cli/index.ts",
      "cli/report":     "src/cli/report.ts",
      "cli/hints-cmd":  "src/cli/hints-cmd.ts",
      "cli/status":     "src/cli/status.ts",
      "cli/budget-cmd": "src/cli/budget-cmd.ts",
      "cli/models-cmd": "src/cli/models-cmd.ts",
      "cli/export-cmd": "src/cli/export-cmd.ts",
      "cli/render":     "src/cli/render.ts",
    },
    dts: false,
  },
]);
