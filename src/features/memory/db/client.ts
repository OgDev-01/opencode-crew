import { Database } from "bun:sqlite"
import { mkdirSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { log } from "@/shared/logger"
import { isDatabaseHealthy, removeCorruptedDbFiles } from "./health-check"

const dbCache = new Map<string, Database>()

const coreSchemaSql = `
CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS learnings (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  type TEXT NOT NULL CHECK(type IN ('success','failure','observation')),
  summary TEXT NOT NULL,
  context TEXT,
  tool_name TEXT,
  domain TEXT,
  tags TEXT,
  utility_score REAL DEFAULT 0.0,
  times_consulted INTEGER DEFAULT 0,
  context_hash TEXT UNIQUE,
  confidence REAL DEFAULT 0.5,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS golden_rules (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  rule TEXT NOT NULL,
  domain TEXT,
  confidence REAL NOT NULL DEFAULT 0.9,
  times_validated INTEGER DEFAULT 0,
  source_learning_ids TEXT DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`

const FTS5_TABLES = [
  {
    name: "learnings_fts",
    create: `CREATE VIRTUAL TABLE IF NOT EXISTS learnings_fts USING fts5(
      summary, context, tags, tool_name, domain,
      content='learnings', content_rowid='rowid'
    )`,
  },
  {
    name: "golden_rules_fts",
    create: `CREATE VIRTUAL TABLE IF NOT EXISTS golden_rules_fts USING fts5(
      rule, domain,
      content='golden_rules', content_rowid='rowid'
    )`,
  },
]

function verifyAndRepairFts5(db: Database): void {
  for (const table of FTS5_TABLES) {
    try {
      db.prepare(`SELECT * FROM ${table.name} LIMIT 0`).all()
    } catch {
      log(`[memory] FTS5 table ${table.name} corrupted — rebuilding`)
      try {
        db.exec(`DROP TABLE IF EXISTS ${table.name}`)
        db.exec(table.create)
        db.exec(`INSERT INTO ${table.name}(${table.name}) VALUES('rebuild')`)
        log(`[memory] FTS5 table ${table.name} rebuilt successfully`)
      } catch (rebuildError) {
        log(`[memory] FTS5 rebuild failed for ${table.name}`, { error: rebuildError })
      }
    }
  }
}

function getCacheKey(dbPath: string): string {
  return dbPath === ":memory:" ? dbPath : resolve(dbPath)
}

export function initializeDatabase(dbPath: string): Database {
  const cacheKey = getCacheKey(dbPath)
  const cached = dbCache.get(cacheKey)
  if (cached) {
    return cached
  }

  let db = openAndValidate(dbPath)
  if (!isDatabaseHealthy(db)) {
    log("[memory] Database corruption detected — recreating")
    db.close()
    removeCorruptedDbFiles(dbPath)
    db = openAndValidate(dbPath)
  }

  dbCache.set(cacheKey, db)
  return db
}

function openAndValidate(dbPath: string): Database {
  if (dbPath !== ":memory:") {
    mkdirSync(dirname(dbPath), { recursive: true })
  }
  const db = new Database(dbPath)
  db.exec("PRAGMA journal_mode = WAL")
  db.exec("PRAGMA busy_timeout = 5000")
  db.exec(coreSchemaSql)
  for (const table of FTS5_TABLES) {
    db.exec(table.create)
  }
  verifyAndRepairFts5(db)
  db.prepare(
    "INSERT OR IGNORE INTO schema_version (version, applied_at) VALUES (1, datetime('now'))"
  ).run()
  return db
}

function expandHomePath(dbPath: string): string {
  if (dbPath.startsWith("~/")) return join(homedir(), dbPath.slice(2))
  return dbPath
}

export function resolveConfiguredDbPath(
  projectRoot: string,
  dbPath: string | undefined,
  fallbackPath: string
): string {
  const candidate = dbPath ?? fallbackPath
  if (!candidate || candidate === ":memory:") return candidate
  if (candidate.startsWith("~/")) return expandHomePath(candidate)
  if (candidate.startsWith("/")) return candidate
  return resolve(projectRoot, candidate)
}

export function getProjectDb(projectRoot: string): Database {
  const dbDir = join(projectRoot, ".opencode", "elf")
  mkdirSync(dbDir, { recursive: true })
  return initializeDatabase(join(dbDir, "memory.db"))
}

export function getGlobalDb(): Database {
  const dbDir = join(homedir(), ".opencode", "elf")
  mkdirSync(dbDir, { recursive: true })
  return initializeDatabase(join(dbDir, "memory.db"))
}

export function getConfiguredDb(
  projectRoot: string,
  scope: "project" | "global",
  projectDbPath?: string,
  globalDbPath?: string
): Database {
  const dbPath = scope === "global"
    ? resolveConfiguredDbPath(projectRoot, globalDbPath, "~/.opencode/elf/memory.db")
    : resolveConfiguredDbPath(projectRoot, projectDbPath, ".opencode/elf/memory.db")

  return initializeDatabase(dbPath)
}

export function closeAll(): void {
  for (const [cacheKey, db] of dbCache.entries()) {
    db.close()
    dbCache.delete(cacheKey)
  }
}
