#!/usr/bin/env node
/**
 * scripts/release.js
 *
 * Usage:
 *   node scripts/release.js patch   → 1.0.0 → 1.0.1
 *   node scripts/release.js minor   → 1.0.0 → 1.1.0
 *   node scripts/release.js major   → 1.0.0 → 2.0.0
 *
 * What it does:
 *   1. Checks working tree is clean
 *   2. Runs tests
 *   3. Bumps version in package.json
 *   4. Updates CHANGELOG.md with today's date
 *   5. Builds
 *   6. Commits, tags vX.Y.Z, pushes to origin
 *   7. Publishes to npm
 */

import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dir = path.dirname(fileURLToPath(import.meta.url));
const root  = path.join(__dir, "..");

const run = (cmd, opts = {}) => {
  console.log(`  $ ${cmd}`);
  return execSync(cmd, { cwd: root, stdio: "inherit", ...opts });
};

const runOut = (cmd) =>
  execSync(cmd, { cwd: root, encoding: "utf8" }).trim();

// ── validate args ─────────────────────────────────────────────────────────────
const bump = process.argv[2];
if (!["patch", "minor", "major"].includes(bump)) {
  console.error("Usage: node scripts/release.js [patch|minor|major]");
  process.exit(1);
}

// ── check git is clean ────────────────────────────────────────────────────────
const status = runOut("git status --porcelain");
if (status) {
  console.error("\n❌ Working tree is not clean. Commit or stash changes first.\n");
  console.error(status);
  process.exit(1);
}

// ── bump version ──────────────────────────────────────────────────────────────
const pkgPath = path.join(root, "package.json");
const pkg     = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
const [major, minor, patch] = pkg.version.split(".").map(Number);

const next =
  bump === "major" ? `${major + 1}.0.0`
  : bump === "minor" ? `${major}.${minor + 1}.0`
  : `${major}.${minor}.${patch + 1}`;

console.log(`\n🚀 Releasing ${pkg.version} → ${next}\n`);

pkg.version = next;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
console.log(`  ✅ package.json → ${next}`);

// ── update CHANGELOG ──────────────────────────────────────────────────────────
const changelogPath = path.join(root, "CHANGELOG.md");
const today         = new Date().toISOString().slice(0, 10);
const changelog     = fs.readFileSync(changelogPath, "utf8");

// Insert new entry after the first line (# Changelog header)
const newEntry = `\n## [${next}] - ${today}\n\n### Added\n- (describe changes here)\n`;
const updated  = changelog.replace("\n## [", newEntry + "\n## [");
fs.writeFileSync(changelogPath, updated);
console.log(`  ✅ CHANGELOG.md → [${next}] - ${today}`);

// ── run tests ─────────────────────────────────────────────────────────────────
console.log("\n🧪 Running tests...\n");
run("npm test");

// ── build ─────────────────────────────────────────────────────────────────────
console.log("\n🔨 Building...\n");
run("npm run build");

// ── git commit + tag ──────────────────────────────────────────────────────────
console.log("\n📦 Committing...\n");
run(`git add package.json CHANGELOG.md`);
run(`git commit -m "chore(release): v${next}"`);
run(`git tag v${next}`);

// ── push ──────────────────────────────────────────────────────────────────────
console.log("\n⬆️  Pushing to origin...\n");
run("git push origin main");
run(`git push origin v${next}`);

// ── npm publish ───────────────────────────────────────────────────────────────
console.log("\n📤 Publishing to npm...\n");
run("npm publish --access public");

console.log(`\n✅ Released token-tracker-mcp@${next}\n`);
console.log(`   npm:    https://www.npmjs.com/package/token-tracker-mcp`);
console.log(`   GitHub: https://github.com/yourusername/token-tracker-mcp/releases/tag/v${next}`);
console.log();
