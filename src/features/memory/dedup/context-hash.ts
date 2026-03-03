import { Database } from "bun:sqlite"

/**
 * Compute SHA-256 based content hash for deduplication.
 * Hash = sha256(type + ':' + scope + ':' + normalizedContent)
 * Normalization: lowercase + trim + collapse whitespace
 */
export function computeContextHash(type: string, scope: string, content: string): string {
  const normalized = content.toLowerCase().trim().replace(/\s+/g, " ")
  const hasher = new Bun.CryptoHasher("sha256")
  hasher.update(type + ":" + scope + ":" + normalized)
  return hasher.digest("hex")
}

/**
 * Find existing entry by context hash.
 * Queries learnings table first, then golden_rules if available.
 * Returns the id of the existing row, or null.
 */
export function findExistingByHash(hash: string, db: Database): string | null {
  const row = db
    .prepare("SELECT id FROM learnings WHERE context_hash = ? LIMIT 1")
    .get(hash) as { id: string } | null

  if (row) return row.id

  // Check golden_rules only if context_hash column exists
  try {
    const ruleRow = db
      .prepare("SELECT id FROM golden_rules WHERE context_hash = ? LIMIT 1")
      .get(hash) as { id: string } | null
    if (ruleRow) return ruleRow.id
  } catch {
    // golden_rules table doesn't have context_hash column yet, skip
  }

  return null
}

/**
 * Deduplicate database by removing rows with duplicate context_hash.
 * Keeps the highest rowid (most recent), removes others.
 * Returns count of rows removed.
 */
export function deduplicateDatabase(db: Database): number {
  // Find all context_hashes with duplicates in learnings
  const duplicateHashes = db
    .prepare(
      `SELECT context_hash FROM learnings 
       WHERE context_hash IS NOT NULL 
       GROUP BY context_hash HAVING COUNT(*) > 1`
    )
    .all() as { context_hash: string }[]

  let removed = 0

  for (const { context_hash } of duplicateHashes) {
    const rows = db
      .prepare("SELECT rowid, id FROM learnings WHERE context_hash = ? ORDER BY rowid DESC")
      .all(context_hash) as { rowid: number; id: string }[]

    if (rows.length > 1) {
      for (let i = 1; i < rows.length; i++) {
        db.prepare("DELETE FROM learnings WHERE rowid = ?").run(rows[i].rowid)
        removed++
      }
    }
  }

  return removed
}
