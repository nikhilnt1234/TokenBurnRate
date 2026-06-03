import { initDb } from "../db/database.js";

const [, , cmd = "report", ...rest] = process.argv;

if (cmd === "version" || cmd === "-v" || cmd === "--version") {
  const { createRequire } = await import("module");
  const pkg = createRequire(import.meta.url)("../../package.json");
  console.log(`token-tracker v${pkg.version}`);
  process.exit(0);
}

if (cmd === "serve" || cmd === "mcp") {
  await import("../index.js");
  process.exit(0);
}

// All other commands need DB
await initDb();

const { runReport }  = await import("./report.js");
const { runHints }   = await import("./hints-cmd.js");
const { runStatus }  = await import("./status.js");
const { runBudget }  = await import("./budget-cmd.js");
const { runModels }  = await import("./models-cmd.js");
const { runExport }  = await import("./export-cmd.js");

const periodArg = (): "today"|"week"|"month"|"all" => {
  const i = rest.indexOf("--period");
  if (i >= 0 && rest[i+1]) return rest[i+1] as any;
  return "week";
};

const helpText = `
  token-tracker — LLM cost observability CLI

  Commands:
    report [--period today|week|month|all]   Full dashboard (default: week)
    today                                    Today's report
    month                                    This month's report
    hints [--period ...]                     Ranked optimization hints
    hint <id>                                Deep-dive on one hint
    status                                   One-line status
    budget                                   Budget gauges
    models                                   Model pricing table
    export [--period ...]                    CSV to stdout
    serve                                    Start MCP server (stdio)
    version                                  Print version

  Examples:
    token-tracker report
    token-tracker report --period month
    token-tracker hints
    token-tracker hint cache-utilization
    token-tracker export > usage.csv
`;

switch (cmd) {
  case "report":  await runReport(periodArg()); break;
  case "today":   await runReport("today");     break;
  case "month":   await runReport("month");     break;
  case "hints":   await runHints(periodArg());  break;
  case "hint":    await runHints(periodArg(), rest.find(r => !r.startsWith("-"))); break;
  case "status":  await runStatus();            break;
  case "budget":  await runBudget();            break;
  case "models":  await runModels();            break;
  case "export":  await runExport(periodArg()); break;
  case "--help":
  case "-h":
  case "help":    console.log(helpText); break;
  default:
    console.error(`\n  Unknown command: "${cmd}"\n`);
    console.log(helpText);
    process.exit(1);
}
