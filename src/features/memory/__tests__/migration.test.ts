import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { existsSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { MemoryConfigSchema } from "../../../config/schema/memory"
import { closeAll, initializeDatabase } from "../db/client"
import { getMemoryManager, resetMemoryManager } from "../manager"
import { createMemoryStorage } from "../storage/memory-storage"

const makeDbPath = (label: string) =>
  join(tmpdir(), `crew-migration-test-${label}-${Date.now()}-${crypto.randomUUID()}.db`)

describe("Memory migration and backward compatibility", () => {
  const dbPaths: string[] = []

  beforeEach(() => {
    closeAll()
    resetMemoryManager()
  })

  afterEach(() => {
    resetMemoryManager()
    closeAll()
    for (const dbPath of dbPaths) if (existsSync(dbPath)) rmSync(dbPath)
    dbPaths.length = 0
  })

  describe("#given schema migration on restart", () => {
    describe("#when database is re-initialized after data insertion", () => {
      describe("#then", () => {
        it("preserves existing learnings across re-initialization", async () => {
          const dbPath = makeDbPath("schema-migration")
          dbPaths.push(dbPath)

          const db = initializeDatabase(dbPath)
          const storage = createMemoryStorage(db)
          await storage.addLearning({
            id: "",
            type: "success",
            summary: "Schema migration preserves data",
            context: "migration test",
            tool_name: "Bash",
            domain: "project",
            tags: ["migration"],
            utility_score: 0.8,
            times_consulted: 0,
            context_hash: `migration-test-${crypto.randomUUID()}`,
            confidence: 0.9,
            created_at: "",
            updated_at: "",
          })

          closeAll()
          const reopenedDb = initializeDatabase(dbPath)
          const rows = reopenedDb.prepare("SELECT * FROM learnings WHERE summary = ?").all("Schema migration preserves data") as Array<{ summary: string; domain: string; type: string }>
          const found = rows[0]

          expect(found).toBeDefined()
          expect(found!.domain).toBe("project")
          expect(found!.type).toBe("success")
        })
      })
    })
  })

  describe("#given missing or empty config", () => {
    describe("#when MemoryConfigSchema parses empty object", () => {
      describe("#then", () => {
        it("produces complete defaults with no undefined fields", () => {
          const result = MemoryConfigSchema.parse({})

          expect(result.enabled).toBe(true)
          expect(typeof result.embedding_model).toBe("string")
          expect(typeof result.similarity_threshold).toBe("number")
          expect(typeof result.max_golden_rules_injected).toBe("number")
          expect(typeof result.max_learnings_injected).toBe("number")
          expect(typeof result.max_injection_tokens).toBe("number")
          expect(typeof result.ttl_learnings_days).toBe("number")
          expect(typeof result.ttl_golden_rules_days).toBe("number")
          expect(typeof result.ttl_heuristics_days).toBe("number")
          expect(typeof result.project_db_path).toBe("string")
          expect(typeof result.global_db_path).toBe("string")
          expect(Array.isArray(result.privacy_tags)).toBeTrue()
          expect(typeof result.dynamic_prompts_enabled).toBe("boolean")
          expect(typeof result.delegation_cost_awareness).toBe("boolean")

          const values = Object.values(result)
          expect(values.every((v) => v !== undefined)).toBeTrue()
        })
      })
    })
  })

  describe("#given memory disabled in config", () => {
    describe("#when applyMemoryConfig receives enabled=false", () => {
      describe("#then", () => {
        it("does not initialize the memory manager", () => {

          const { applyMemoryConfig } = require("../../../plugin-handlers/memory-config")
          const pluginConfig = { memory: { enabled: false } }
          applyMemoryConfig(pluginConfig)

          let threw = false
          try {
            getMemoryManager()
          } catch {
            threw = true
          }
          expect(threw).toBeTrue()
        })
      })
    })
  })

  describe("#given existing hook factories", () => {
    describe("#when session and transform hooks are created", () => {
      describe("#then", () => {
        it("includes memory hooks alongside all pre-existing hooks", () => {
          const { createSessionHooks } = require("../../../plugin/hooks/create-session-hooks")
          const { createTransformHooks } = require("../../../plugin/hooks/create-transform-hooks")

          const stubCtx = {
            directory: "/tmp/test",
            client: {
              session: { get: async () => null },
              tui: { showToast: async () => {} },
            },
          }

          const sessionHooks = createSessionHooks({
            ctx: stubCtx,
            pluginConfig: {},
            modelCacheState: { cachedMaxTokens: new Map() },
            isHookEnabled: () => true,
            safeHookEnabled: false,
          })

          const transformHooks = createTransformHooks({
            ctx: stubCtx,
            pluginConfig: {},
            isHookEnabled: () => true,
            safeHookEnabled: false,
          })

          const sessionKeys = Object.keys(sessionHooks)
          const transformKeys = Object.keys(transformHooks)

          expect(sessionKeys).toContain("memoryLearning")
          expect(sessionKeys).toContain("contextWindowMonitor")
          expect(sessionKeys).toContain("thinkMode")
          expect(sessionKeys).toContain("ralphLoop")
          expect(sessionKeys).toContain("runtimeFallback")
          expect(sessionKeys).toContain("anthropicEffort")

          expect(transformKeys).toContain("memoryInjection")
          expect(transformKeys).toContain("heartbeatPruner")
          expect(transformKeys).toContain("claudeCodeHooks")
          expect(transformKeys).toContain("keywordDetector")
          expect(transformKeys).toContain("thinkingBlockValidator")
        })
      })
    })
  })

  describe("#given ELF tool export", () => {
    describe("#when createElfTool is called with deps", () => {
      describe("#then", () => {
        it("returns a tool named elf with an execute function", () => {
          const { createElfTool } = require("../../../tools/elf/tool")

          const stubDeps = {
            storage: { addLearning: async () => {}, addGoldenRule: async () => {}, getStats: async () => ({ learnings: 0, goldenRules: 0 }) },
            search: { searchAll: async () => [], searchGoldenRules: async () => [], searchLearnings: async () => [] },
            db: {},
            filterContent: (c: string) => c,
            computeContextHash: () => "hash",
            findExistingByHash: () => null,
          }

          const elfTool = createElfTool(stubDeps)

          expect(elfTool.description).toBeTruthy()
          expect(typeof elfTool.execute).toBe("function")
        })
      })
    })
  })
})
