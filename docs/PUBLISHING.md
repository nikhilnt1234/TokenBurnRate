# Publishing to npm — Step-by-Step

## One-time setup (do this once)

### 1. Create npm account
Go to https://www.npmjs.com/signup and create a free account.

### 2. Login from terminal
```bash
npm login
# enter your username, password, email
# verify the one-time code in your email
```

### 3. Create GitHub repo
```bash
cd token-tracker-mcp
git init
git add .
git commit -m "feat: initial release"
git branch -M main
gh repo create token-tracker-mcp --public --push
# or use github.com/new if you don't have the gh CLI
```

### 4. Update your GitHub URL in package.json
Replace `yourusername` with your actual GitHub username in:
- `package.json` → `repository.url`
- `README.md` → all GitHub links

### 5. Add NPM_TOKEN to GitHub secrets
```
github.com/YOUR_USERNAME/token-tracker-mcp
→ Settings → Secrets and variables → Actions → New repository secret
Name: NPM_TOKEN
Value: (from npm.com → Avatar → Access Tokens → Generate New Token → Automation)
```

---

## Release workflow (every time you ship)

### Option A — automated (recommended)
```bash
npm run release:patch   # bug fix: 1.0.0 → 1.0.1
npm run release:minor   # new feature: 1.0.0 → 1.1.0
npm run release:major   # breaking change: 1.0.0 → 2.0.0
```

This runs tests → bumps version → updates CHANGELOG → builds → commits → tags → pushes → publishes.

### Option B — manual
```bash
# 1. bump version
npm version patch  # or minor / major

# 2. build + test
npm run build
npm test

# 3. publish
npm publish --access public

# 4. push tag
git push origin main --tags
```

---

## First publish checklist

Before your first `npm publish`:

- [ ] `npm run build` succeeds with no errors
- [ ] `npm test` passes
- [ ] `node dist/cli/index.js report` shows the dashboard (even with no data)
- [ ] `node dist/cli/index.js hints` shows "no data" gracefully
- [ ] `package.json` has correct `name`, `version`, `description`, `repository`
- [ ] `README.md` has real GitHub URLs (not `yourusername`)
- [ ] `.npmignore` or `files` field excludes `src/`, `tests/`, `scripts/`

---

## After publishing — launch checklist

### Day 1
- [ ] Post on r/ClaudeAI: "I built a token cost tracker MCP — shows you where your $ goes + how to cut it"
- [ ] Post on r/cursor and r/LocalLLaMA (same post, slightly adjusted)
- [ ] Submit to https://mcpservers.org (they have a submission form)
- [ ] Submit a PR to https://github.com/punkpeye/awesome-mcp-servers

### Day 2–3
- [ ] Record a 60-second terminal GIF of `token-tracker report` → upload to README
  (use `asciinema` or `vhs` to record: `brew install charmbracelet/tap/vhs`)
- [ ] Post on X/Twitter with the GIF

### Week 2
- [ ] Product Hunt launch (requires a proper GIF/screenshot, tagline, and 3 bullet points)

---

## Useful commands after publish

```bash
# check it installed correctly
npx token-tracker-mcp version

# see your package on npm
open https://www.npmjs.com/package/token-tracker-mcp

# check download stats
npm info token-tracker-mcp
```
