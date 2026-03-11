import { Database } from "bun:sqlite"
import type { GoldenRule, IMemoryStorage, Learning } from "../types"

type LearningRow = Omit<Learning, "tags"> & { tags: string | null; rowid: number }
type GoldenRuleRow = Omit<GoldenRule, "source_learning_ids"> & {
  source_learning_ids: string | null
  rowid: number
}

function toLearningRow(learning: Learning): Omit<LearningRow, "rowid"> {
  return {
    ...learning,
    tags: learning.tags.join(","),
  }
}

function fromLearningRow(row: LearningRow): Learning {
  return {
    ...row,
    tags: row.tags ? row.tags.split(",").filter((tag) => tag.length > 0) : [],
  }
}

function toGoldenRuleRow(rule: GoldenRule): Omit<GoldenRuleRow, "rowid"> {
  return {
    ...rule,
    source_learning_ids: JSON.stringify(rule.source_learning_ids),
  }
}

function fromGoldenRuleRow(row: GoldenRuleRow): GoldenRule {
  return {
    ...row,
    source_learning_ids: row.source_learning_ids
      ? (JSON.parse(row.source_learning_ids) as string[])
      : [],
  }
}

export function createMemoryStorage(db: Database): IMemoryStorage {
  const addLearningTx = db.transaction((learning: Learning) => {
    const payload = toLearningRow(learning)
    db.prepare(
      "INSERT INTO learnings (id, type, summary, context, tool_name, domain, tags, utility_score, times_consulted, context_hash, confidence, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(
      payload.id,
      payload.type,
      payload.summary,
      payload.context,
      payload.tool_name,
      payload.domain,
      payload.tags,
      payload.utility_score,
      payload.times_consulted,
      payload.context_hash,
      payload.confidence,
      payload.created_at,
      payload.updated_at
    )
    const row = db.prepare("SELECT rowid FROM learnings WHERE id = ?").get(learning.id) as
      | { rowid: number }
      | null
    if (!row) throw new Error(`Learning rowid not found for ${learning.id}`)
    db.prepare(
      "INSERT INTO learnings_fts(rowid, summary, context, tags, tool_name, domain) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(row.rowid, learning.summary, learning.context, payload.tags ?? "", learning.tool_name, learning.domain)
  })

  const updateLearningTx = db.transaction((id: string, updates: Partial<Learning>) => {
    const existing = db.prepare("SELECT rowid, * FROM learnings WHERE id = ?").get(id) as LearningRow | null
    if (!existing) throw new Error(`Learning not found: ${id}`)
    const now = new Date().toISOString()
    const merged: Learning = {
      ...fromLearningRow(existing),
      ...updates,
      id,
      created_at: existing.created_at,
      updated_at: now,
    }
    const payload = toLearningRow(merged)
    db.prepare(
      "UPDATE learnings SET type = ?, summary = ?, context = ?, tool_name = ?, domain = ?, tags = ?, utility_score = ?, times_consulted = ?, context_hash = ?, confidence = ?, updated_at = ? WHERE id = ?"
    ).run(
      payload.type,
      payload.summary,
      payload.context,
      payload.tool_name,
      payload.domain,
      payload.tags,
      payload.utility_score,
      payload.times_consulted,
      payload.context_hash,
      payload.confidence,
      payload.updated_at,
      id
    )
    db.prepare("DELETE FROM learnings_fts WHERE rowid = ?").run(existing.rowid)
    db.prepare(
      "INSERT INTO learnings_fts(rowid, summary, context, tags, tool_name, domain) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(existing.rowid, merged.summary, merged.context, payload.tags ?? "", merged.tool_name, merged.domain)
  })

  const incrementTimesConsultedTx = db.transaction((id: string) => {
    const now = new Date().toISOString()
    const result = db.prepare(
      "UPDATE learnings SET times_consulted = times_consulted + 1, updated_at = ? WHERE id = ?"
    ).run(now, id)

    if (result.changes === 0) {
      throw new Error(`Learning not found: ${id}`)
    }
  })

  const deleteLearningTx = db.transaction((id: string) => {
    const row = db.prepare("SELECT rowid FROM learnings WHERE id = ?").get(id) as { rowid: number } | null
    if (row) db.prepare("DELETE FROM learnings_fts WHERE rowid = ?").run(row.rowid)
    db.prepare("DELETE FROM learnings WHERE id = ?").run(id)
  })

  const addGoldenRuleTx = db.transaction((rule: GoldenRule) => {
    const payload = toGoldenRuleRow(rule)
    db.prepare(
      "INSERT INTO golden_rules (id, rule, domain, confidence, times_validated, source_learning_ids, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(
      payload.id,
      payload.rule,
      payload.domain,
      payload.confidence,
      payload.times_validated,
      payload.source_learning_ids,
      payload.created_at,
      payload.updated_at
    )
    const row = db.prepare("SELECT rowid FROM golden_rules WHERE id = ?").get(rule.id) as
      | { rowid: number }
      | null
    if (!row) throw new Error(`Golden rule rowid not found for ${rule.id}`)
    db.prepare("INSERT INTO golden_rules_fts(rowid, rule, domain) VALUES (?, ?, ?)").run(
      row.rowid,
      rule.rule,
      rule.domain
    )
  })

  return {
    async addLearning(learning) {
      const now = new Date().toISOString()
      addLearningTx({ ...learning, id: crypto.randomUUID(), created_at: now, updated_at: now })
    },
    async getLearning(id) {
      const row = db.prepare("SELECT rowid, * FROM learnings WHERE id = ?").get(id) as LearningRow | null
      return row ? fromLearningRow(row) : null
    },
    async updateLearning(id, updates) {
      updateLearningTx(id, updates)
    },
    async incrementTimesConsulted(id) {
      incrementTimesConsultedTx(id)
    },
    async deleteLearning(id) {
      deleteLearningTx(id)
    },
    async addGoldenRule(rule) {
      const now = new Date().toISOString()
      addGoldenRuleTx({ ...rule, id: crypto.randomUUID(), created_at: now, updated_at: now })
    },
    async getGoldenRules(domain) {
      const query = domain
        ? "SELECT rowid, * FROM golden_rules WHERE domain = ? ORDER BY created_at DESC"
        : "SELECT rowid, * FROM golden_rules ORDER BY created_at DESC"
      const rows = domain
        ? (db.prepare(query).all(domain) as GoldenRuleRow[])
        : (db.prepare(query).all() as GoldenRuleRow[])
      return rows.map(fromGoldenRuleRow)
    },
    async getStats() {
      const learningsRow = db.prepare("SELECT COUNT(*) as count FROM learnings").get() as { count: number }
      const rulesRow = db.prepare("SELECT COUNT(*) as count FROM golden_rules").get() as { count: number }
      const oldest = db.prepare("SELECT created_at FROM learnings ORDER BY created_at ASC LIMIT 1").get() as
        | { created_at: string }
        | null
      return {
        learnings: learningsRow.count,
        goldenRules: rulesRow.count,
        oldestLearning: oldest ? new Date(oldest.created_at) : null,
      }
    },
    async getLearningsByScope(scope) {
      const rows = db.prepare("SELECT rowid, * FROM learnings WHERE domain = ? ORDER BY created_at DESC").all(scope) as LearningRow[]
      return rows.map(fromLearningRow)
    },
    async getGoldenRulesByScope(scope) {
      const rows = db.prepare("SELECT rowid, * FROM golden_rules WHERE domain = ? ORDER BY created_at DESC").all(scope) as GoldenRuleRow[]
      return rows.map(fromGoldenRuleRow)
    },
    async deleteGoldenRule(id) {
      const row = db.prepare("SELECT rowid FROM golden_rules WHERE id = ?").get(id) as { rowid: number } | null
      if (row) db.prepare("DELETE FROM golden_rules_fts WHERE rowid = ?").run(row.rowid)
      db.prepare("DELETE FROM golden_rules WHERE id = ?").run(id)
    },
  }
}
