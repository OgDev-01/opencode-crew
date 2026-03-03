import { Database } from "bun:sqlite"
import { renameSync, unlinkSync } from "node:fs"
import { log } from "@/shared/logger"

function runQuickIntegrityCheck(db: Database): boolean {
  try {
    const result = db.prepare("PRAGMA quick_check(1)").get() as { quick_check: string }
    return result.quick_check === "ok"
  } catch {
    return false
  }
}

function probeCoreTables(db: Database): boolean {
  try {
    db.prepare("SELECT 1 FROM schema_version LIMIT 0").all()
    db.prepare("SELECT 1 FROM learnings LIMIT 0").all()
    db.prepare("SELECT 1 FROM golden_rules LIMIT 0").all()
    return true
  } catch {
    return false
  }
}

export function isDatabaseHealthy(db: Database): boolean {
  return runQuickIntegrityCheck(db) && probeCoreTables(db)
}

export function removeCorruptedDbFiles(dbPath: string): void {
  const backupPath = `${dbPath}.corrupted.${Date.now()}`
  try {
    renameSync(dbPath, backupPath)
    log(`[memory] Corrupted DB backed up to ${backupPath}`)
  } catch {
    try {
      unlinkSync(dbPath)
    } catch { /* already gone */ }
  }
  for (const suffix of ["-wal", "-shm"]) {
    try {
      unlinkSync(`${dbPath}${suffix}`)
    } catch { /* may not exist */ }
  }
  log("[memory] Removed corrupted DB files — will recreate fresh")
}