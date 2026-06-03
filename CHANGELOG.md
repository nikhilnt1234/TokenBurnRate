# Changelog

All notable changes to this project will be documented in this file.

## [1.0.0] - 2026-06-02

### Added
- Initial release
- `log_usage` tool with auto cost calculation and budget alerts
- `get_summary` tool with model breakdown
- `set_budget` tool with period-based alerts
- `list_sessions` tool
- `list_models` pricing table
- `export_csv` tool
- SQLite local storage at `~/.token-tracker/usage.db`
- Prompt cache token tracking (read + write)
- Support for Anthropic, OpenAI, and Google models
- GitHub Actions CI with Node 20/22 matrix
- `scripts/setup.js` for auto-configuring Claude Desktop
