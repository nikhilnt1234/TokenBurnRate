/**
 * database.ts
 * Uses Node's built-in SQLite (Node ≥ 22.5).
 * Falls back to better-sqlite3 for Node 18/20.
 *
 * The "node:sqlite" specifier is constructed at runtime to prevent
 * esbuild/tsup from rewriting dynamic import specifiers.
 */

import fs from "fs";
import path from "path";
import os from "os";
import { createRequire } from "module";

const DB_DIR  = path.join(os.homedir(), ".token-tracker");
const DB_PATH = path.join(DB_DIR, "usage.db");

export interface DbStatement {
  run:  (...args: any[]) => { lastInsertRowid: number | bigint; changes: number };
  get:  (...args: any[]) => any;
  all:  (...args: any[]) => any[];
}

export interface Db {
  prepare: (sql: string) => DbStatement;
  exec:    (sql: string) => void;
}

let _db: Db | null = null;

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS usage_events (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id          TEXT    NOT NULL,
    model               TEXT    NOT NULL,
    provider            TEXT    NOT NULL DEFAULT 'anthropic',
    input_tokens        INTEGER NOT NULL DEFAULT 0,
    output_tokens       INTEGER NOT NULL DEFAULT 0,
    cache_read_tokens   INTEGER NOT NULL DEFAULT 0,
    cache_write_tokens  INTEGER NOT NULL DEFAULT 0,
    cost_usd            REAL    NOT NULL DEFAULT 0,
    task_type           TEXT,
    project             TEXT,
    notes               TEXT,
    created_at          INTEGER NOT NULL DEFAULT (unixepoch())
  );
  CREATE TABLE IF NOT EXISTS budgets (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    label      TEXT    NOT NULL,
    period     TEXT    NOT NULL CHECK(period IN ('daily','weekly','monthly')),
    limit_usd  REAL    NOT NULL,
    alert_pct  REAL    NOT NULL DEFAULT 80,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
  CREATE INDEX IF NOT EXISTS idx_usage_session ON usage_events(session_id);
  CREATE INDEX IF NOT EXISTS idx_usage_created ON usage_events(created_at);
  CREATE INDEX IF NOT EXISTS idx_usage_model   ON usage_events(model);
`;

function nodeMajor(): number {
  return parseInt(process.versions.node.split(".")[0], 10);
}

function wrapDb(raw: any, isBSQLite = false): Db {
  if (isBSQLite) raw.pragma("journal_mode = WAL");
  return {
    prepare: (sql: string): DbStatement => {
      const stmt = raw.prepare(sql);
      return {
        run:  (...args: any[]) => {
          const r = stmt.run(...args);
          return { lastInsertRowid: r.lastInsertRowid as number, changes: r.changes as number };
        },
        get:  (...args: any[]) => stmt.get(...args) ?? null,
        all:  (...args: any[]) => stmt.all(...args),
      };
    },
    exec: (sql: string) => raw.exec(sql),
  };
}

export async function initDb(): Promise<Db> {
  if (_db) return _db;
  if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

  if (nodeMajor() >= 22) {
    // Suppress the "SQLite is experimental" warning
    const _emit = process.emitWarning.bind(process);
    process.emitWarning = (w: any, ...a: any[]) => {
      if (typeof w === "string" && w.includes("SQLite")) return;
      _emit(w, ...a);
    };

    // Build specifier at runtime so esbuild/tsup can't rewrite it
    const specifier = ["node", "sqlite"].join(":");
    const { DatabaseSync } = await import(/* @vite-ignore */ specifier as any);
    const raw = new DatabaseSync(DB_PATH);
    _db = wrapDb(raw);
    _db.exec(SCHEMA);
    return _db;
  }

  // Node 18/20: use better-sqlite3
  const mod = await import("better-sqlite3");
  const BSQLite = (mod as any).default ?? mod;
  _db = wrapDb(new BSQLite(DB_PATH), true);
  _db.exec(SCHEMA);
  return _db;
}

export function getDb(): Db {
  if (!_db) throw new Error("DB not initialised — call initDb() first.");
  return _db;
}
