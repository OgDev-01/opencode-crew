import { Database } from "bun:sqlite"
import type { IMemoryStorage } from "../types"

export interface CleanupReport {
  expired: number
  evicted: number
  total_freed: number
}

export interface ICleanupService {
  cleanup(options?: { dryRun?: boolean }): Promise<CleanupReport>
}

interface UtilityScorerFunctions {
  applyTemporalDecay(score: number, daysSinceLastAccess: number): number
  isEvictionCandidate(score: number, daysSinceLastAccess: number): boolean
}

const TTL_DAYS = {
  observation: 30,
  success: 60,
  failure: 90,
}

export function createCleanupService(
  storage: IMemoryStorage,
  scorer: UtilityScorerFunctions,
  db?: Database
): ICleanupService {
  return {
    async cleanup(options?: { dryRun?: boolean }): Promise<CleanupReport> {
      const isDryRun = options?.dryRun ?? false
      let expired = 0
      let evicted = 0

      if (!db) {
        return { expired: 0, evicted: 0, total_freed: 0 }
      }

      const now = Date.now()

      const allLearnings = db
        .prepare("SELECT id, type, updated_at, utility_score FROM learnings")
        .all() as Array<{
        id: string
        type: string
        updated_at: string
        utility_score: number
      }>

      const toDelete: string[] = []

      for (const learning of allLearnings) {
        const lastAccessTime = new Date(learning.updated_at).getTime()
        const daysSinceLastAccess = (now - lastAccessTime) / 86400000

        const type = learning.type as keyof typeof TTL_DAYS
        const ttl = TTL_DAYS[type] ?? 90

        if (daysSinceLastAccess >= ttl) {
          expired++
          toDelete.push(learning.id)
        } else if (
          scorer.isEvictionCandidate(learning.utility_score, daysSinceLastAccess)
        ) {
          evicted++
          toDelete.push(learning.id)
        }
      }

      if (!isDryRun) {
        for (const id of toDelete) {
          await storage.deleteLearning(id)
        }
      }

      return {
        expired,
        evicted,
        total_freed: expired + evicted,
      }
    },
  }
}
