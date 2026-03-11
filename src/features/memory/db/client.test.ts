import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { existsSync, mkdtempSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import {
  closeAll,
  getConfiguredDb,
  getProjectDb,
  initializeDatabase,
  resolveConfiguredDbPath,
} from "./client"

describe("#given database client", () => {
  let createdDirs: string[] = []

  beforeEach(() => {
    createdDirs = []
  })

  afterEach(() => {
    closeAll()
    for (const dir of createdDirs) {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  describe("#when initializing in-memory database", () => {
    it("#then creates all required tables", () => {
      const db = initializeDatabase(":memory:")
      const rows = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type IN ('table', 'virtual table') ORDER BY name"
        )
        .all() as Array<{ name: string }>
      const tableNames = rows.map((row) => row.name)

      expect(tableNames).toContain("schema_version")
      expect(tableNames).toContain("learnings")
      expect(tableNames).toContain("golden_rules")
      expect(tableNames).toContain("learnings_fts")
      expect(tableNames).toContain("golden_rules_fts")
    })

    it("#then inserts schema version 1", () => {
      const db = initializeDatabase(":memory:")
      const row = db
        .prepare("SELECT version FROM schema_version WHERE version = 1")
        .get() as { version: number } | null

      expect(row).not.toBeNull()
      expect(row?.version).toBe(1)
    })
  })

  describe("#when initializing file-backed database", () => {
    it("#then sets journal mode to wal", () => {
      const dir = mkdtempSync(join(tmpdir(), "memory-db-"))
      createdDirs.push(dir)
      const db = initializeDatabase(join(dir, "memory.db"))
      const row = db.prepare("PRAGMA journal_mode").get() as {
        journal_mode: string
      }

      expect(row.journal_mode.toLowerCase()).toBe("wal")
    })
  })

  describe("#when requesting a project database", () => {
    it("#then creates project db directory and file", () => {
      const projectRoot = mkdtempSync(join(tmpdir(), "memory-project-"))
      createdDirs.push(projectRoot)

      const db = getProjectDb(projectRoot)
      const expectedDbPath = join(projectRoot, ".opencode", "elf", "memory.db")

      expect(existsSync(join(projectRoot, ".opencode", "elf"))).toBe(true)
      expect(existsSync(expectedDbPath)).toBe(true)

      const row = db.prepare("SELECT 1 as one").get() as { one: number }
      expect(row.one).toBe(1)
    })
  })

  describe("#when requesting a configured database", () => {
    it("#then uses custom project_db_path relative to project root", () => {
      const projectRoot = mkdtempSync(join(tmpdir(), "memory-configured-project-"))
      createdDirs.push(projectRoot)

      const db = getConfiguredDb(projectRoot, "project", "custom/project-memory.db")
      const expectedDbPath = join(projectRoot, "custom", "project-memory.db")

      expect(existsSync(expectedDbPath)).toBe(true)
      const row = db.prepare("SELECT 1 as one").get() as { one: number }
      expect(row.one).toBe(1)
    })

    it("#then uses relative global_db_path relative to project root", () => {
      const projectRoot = mkdtempSync(join(tmpdir(), "memory-configured-global-"))
      createdDirs.push(projectRoot)

      const db = getConfiguredDb(projectRoot, "global", undefined, "shared/global-memory.db")
      const expectedDbPath = join(projectRoot, "shared", "global-memory.db")

      expect(existsSync(expectedDbPath)).toBe(true)
      const row = db.prepare("SELECT 1 as one").get() as { one: number }

      expect(row.one).toBe(1)
    })

    it("#then resolves home-prefixed paths without opening a real home db", () => {
      const projectRoot = mkdtempSync(join(tmpdir(), "memory-configured-home-"))
      createdDirs.push(projectRoot)

      const resolvedPath = resolveConfiguredDbPath(projectRoot, "~/.opencode/elf/test-memory.db", ".opencode/elf/memory.db")
      expect(resolvedPath).toBe(join(require("node:os").homedir(), ".opencode", "elf", "test-memory.db"))
    })

    it("#then preserves :memory: paths", () => {
      const projectRoot = mkdtempSync(join(tmpdir(), "memory-configured-memory-"))
      createdDirs.push(projectRoot)

      const resolvedPath = resolveConfiguredDbPath(projectRoot, ":memory:", ".opencode/elf/memory.db")
      expect(resolvedPath).toBe(":memory:")
    })
  })

  describe("#when closing all cached databases", () => {
    it("#then closes open connections", () => {
      const projectRoot = mkdtempSync(join(tmpdir(), "memory-close-"))
      createdDirs.push(projectRoot)

      const db = getProjectDb(projectRoot)
      closeAll()

      expect(() => db.exec("SELECT 1")).toThrow()
    })
  })

 describe("#when FTS5 virtual table is corrupted", () => {
    it("#then auto-rebuilds the FTS5 index from content table", () => {
      const db = initializeDatabase(":memory:")

      db.prepare(
        "INSERT INTO learnings (id, type, summary, context) VALUES ('l1', 'observation', 'test summary', 'test context')"
      ).run()
      db.exec("INSERT INTO learnings_fts(learnings_fts) VALUES('rebuild')")

      db.exec("DROP TABLE IF EXISTS learnings_fts")
      db.exec("DROP TABLE IF EXISTS golden_rules_fts")

      closeAll()
      const db2 = initializeDatabase(":memory:")

      const tables = db2
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE '%_fts' ORDER BY name"
        )
        .all() as Array<{ name: string }>
      const tableNames = tables.map((r) => r.name)

      expect(tableNames).toContain("learnings_fts")
      expect(tableNames).toContain("golden_rules_fts")
    })
  })
})
