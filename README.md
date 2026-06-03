# TokenBurnRate

> See where your AI tokens go — and how to spend less of them.

[![npm](https://img.shields.io/npm/v/token-tracker-mcp?color=f97316)](https://npmjs.com/package/token-tracker-mcp)
[![npm downloads](https://img.shields.io/npm/dm/token-tracker-mcp?color=fb923c)](https://npmjs.com/package/token-tracker-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node ≥22](https://img.shields.io/badge/node-%3E%3D22-brightgreen)](https://nodejs.org)

---

**TokenBurnRate** is an MCP server + CLI that logs every Claude / GPT / Gemini API call locally, shows you a cost dashboard in your terminal, and tells you *exactly* how to reduce that cost.

```
  ⬡ token-tracker  LAST 7 DAYS
────────────────────────────────────────────────────────────────────────

  Overview
  Total cost          $18.7421   (~$80.59/month est.)
  API calls           347
  Input tokens        4.82M
  Cache reads         620K  (11.4% hit rate)

  Daily Cost
  Mon Jun 02  ████████████░░░░░░░░░░░░   $2.14
  Tue Jun 03  ████████████████████░░░░   $3.82
  Thu Jun 05  ████████████████████████   $4.51

  💡 Optimization Hints               saves $31.20/mo
  ● CRIT  Prompt cache barely used
          Cache hit rate: 11.4% — target is 30–60%
          Action: Move static content to top of messages
          Est. saving: $12.40/month

  ● HIGH  Expensive model doing test generation
          104 test-gen calls on Sonnet costing $2.25/week
          Action: Route to claude-haiku-4-5, saves 80%
          Est. saving: $7.80/month
```

---

## Install

```bash
npm install -g token-tracker-mcp
```

Or run without installing:
```bash
npx token-tracker-mcp report
```

## Add to Claude Desktop

```bash
node scripts/setup.js
```

Or add manually to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "token-tracker": {
      "command": "token-tracker",
      "args": ["serve"]
    }
  }
}
```

Restart Claude Desktop. Done.

---

## CLI Commands

| Command | Description |
|---|---|
| `token-tracker report` | Full 7-day dashboard |
| `token-tracker report --period month` | Monthly report |
| `token-tracker today` | Today only |
| `token-tracker hints` | Optimization hints ranked by $ saving |
| `token-tracker hint <id>` | Deep-dive on one hint |
| `token-tracker status` | One-line: cost · cache % · top hint |
| `token-tracker budget` | Budget gauges |
| `token-tracker models` | Pricing table for all models |
| `token-tracker export > out.csv` | Raw CSV export |

---

## MCP Tools (use inside Claude)

| Tool | Description |
|---|---|
| `log_usage` | Log an API call — auto-calculates cost |
| `get_summary` | Summary for today / week / month / all |
| `get_hints` | Ranked optimization hints with $ savings |
| `get_hint_detail` | Deep-dive on a specific hint |
| `set_budget` | Set a daily / weekly / monthly spend limit |
| `list_sessions` | Sessions ranked by cost |
| `list_models` | Pricing table |
| `export_csv` | CSV dump |

---

## Optimization Hints Engine

8 deterministic rules — no LLM calls, runs instantly on your local data:

| Hint | Triggers when |
|---|---|
| `cache-utilization` | Cache hit rate < 30% |
| `model-swap-testing` | Test gen running on Sonnet / Opus |
| `model-swap-debug` | Debugging on Opus |
| `verbose-outputs` | Output / input ratio > 0.35 |
| `session-spike` | Any session costs 3× your average |
| `context-bloat` | Avg tokens / call > 8K |
| `retry-loops` | Sessions with 30+ high-token calls |
| `single-model-dependency` | 100% traffic on one expensive model |

Each hint includes severity · evidence · recommended action · estimated monthly saving.

---

## Privacy

All data stored at `~/.token-tracker/usage.db` (SQLite).
**Nothing leaves your machine.** No telemetry, no account required.

---

## Development

```bash
git clone https://github.com/nikhilnt1234/TokenBurnRate.git
cd TokenBurnRate
npm install --ignore-scripts
npx tsup
npm test
```

---

## Roadmap

- [ ] Team / Supabase backend (multi-user shared dashboard)
- [ ] Weekly email digest
- [ ] Slack / webhook alerts
- [ ] macOS menubar app

---

## License

MIT © 2026 Nikhil T
