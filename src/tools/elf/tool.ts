import { Database } from "bun:sqlite"
import { tool } from "@opencode-ai/plugin"
import type { GoldenRule, IMemoryStorage, Learning, LearningType, MemoryScope } from "@/features/memory/types"
import type { SearchOptions } from "@/features/memory/search/search-service"
import type { MemorySearchResult } from "@/features/memory/types"
import { isLikelyMemoryDump } from "@/features/memory/memory-dump-detector"

function mapToLearningType(input: string): LearningType {
  if (input === "success" || input === "failure" || input === "observation") return input
  return "observation"
}

export interface ElfToolDeps {
  storage: IMemoryStorage
  search: {
    searchAll(query: string, options?: Partial<SearchOptions>): Promise<MemorySearchResult[]>
    searchGoldenRules(query: string, options?: Partial<SearchOptions>): Promise<MemorySearchResult[]>
    searchLearnings(query: string, options?: Partial<SearchOptions>): Promise<MemorySearchResult[]>
  }
  db: Database
  filterContent: (content: string, privacyTags: string[]) => string
  computeContextHash: (type: string, scope: string, content: string) => string
  findExistingByHash: (hash: string, db: Database) => string | null
}

interface ElfToolArgs {
  action: string
  query?: string
  type?: string
  scope?: MemoryScope
  limit?: number
  content?: string
  id?: string
}

const DESCRIPTION = `Emergent Learning Framework (ELF) memory tool. Actions:
- search: Query memory for relevant learnings/rules. Params: query (required), type?, scope?, limit?
- add-rule: Store a new learning or golden rule. Params: content (required), type (golden_rule|learning|fact), scope?
- delete-rule: Remove a memory item by ID. Params: id (required), type? (learning|golden_rule)
- update-rule: Update a memory item by ID. Params: id (required), content (required), type?, scope?
- metrics: Get memory system statistics. No params needed.`

const PRIVACY_TAGS = ["private", "secret", "credential"]


export function createElfTool(deps: ElfToolDeps) {
  return tool({
    description: DESCRIPTION,
    args: {
      action: tool.schema.string().describe("Action: search, add-rule, delete-rule, update-rule, or metrics"),
      query: tool.schema.string().optional().describe("Search query (required for search)"),
      type: tool.schema.string().optional().describe("Memory type filter or entry type"),
      scope: tool.schema.string().optional().describe("project or global scope"),
      limit: tool.schema.number().optional().describe("Max results for search"),
      content: tool.schema.string().optional().describe("Content for add-rule action"),
      id: tool.schema.string().optional().describe("Memory item ID for delete/update operations"),
    },
    async execute(args: ElfToolArgs) {
      switch (args.action) {
        case "search":
          return handleSearch(deps, args)
        case "add-rule":
          return handleAddRule(deps, args)
        case "metrics":
          return handleMetrics(deps)
        case "delete-rule":
          return handleDeleteRule(deps, args)
        case "update-rule":
          return handleUpdateRule(deps, args)
        default:
          return `Unknown action "${args.action}". Valid actions: search, add-rule, delete-rule, update-rule, metrics`
      }
    },
  })
}

async function handleSearch(deps: ElfToolDeps, args: ElfToolArgs): Promise<string> {
  if (!args.query) {
    return JSON.stringify({ error: "query is required for search action" })
  }

  const options: Partial<SearchOptions> = {
    maxResults: args.limit ?? 10,
    scope: (args.scope as MemoryScope) ?? "project",
  }

  let results: MemorySearchResult[]
  if (args.type === "golden_rule") {
    results = await deps.search.searchGoldenRules(args.query, options)
  } else if (args.type === "learning") {
    results = await deps.search.searchLearnings(args.query, options)
  } else {
    results = await deps.search.searchAll(args.query, options)
  }

  await Promise.allSettled(
    results
      .filter((result) => result.type === "learning")
      .map(async (result) => {
        const learning = result.entry as { id: string }
        await deps.storage.incrementTimesConsulted(learning.id)
      })
  )

  return JSON.stringify({
    results: results.map((r) => ({
      id: (r.entry as { id: string }).id,
      type: r.type,
      score: r.score,
      content: r.type === "golden_rule"
        ? (r.entry as { rule: string }).rule
        : (r.entry as { summary: string }).summary,
    })),
  })
}

async function handleAddRule(deps: ElfToolDeps, args: ElfToolArgs): Promise<string> {
  if (!args.content) {
    return JSON.stringify({ error: "content is required for add-rule action" })
  }

  const entryType = args.type ?? "learning"
  const scope = args.scope ?? "project"

  const filtered = deps.filterContent(args.content, PRIVACY_TAGS)
  if (isLikelyMemoryDump(filtered)) {
    return JSON.stringify({
      error: "content appears to be a memory dump transcript and was rejected",
      status: "rejected",
    })
  }
  const shouldDeduplicate = entryType !== "golden_rule"
  const hash = shouldDeduplicate ? deps.computeContextHash(entryType, scope, filtered) : null
  const existingId = hash ? deps.findExistingByHash(hash, deps.db) : null

  if (shouldDeduplicate && existingId) {
    return JSON.stringify({ deduplicated: true, existingId, status: "duplicate" })
  }

  const id = crypto.randomUUID()

  if (entryType === "golden_rule") {
    await deps.storage.addGoldenRule({
      id,
      rule: filtered,
      domain: scope,
      confidence: 0.9,
      times_validated: 0,
      times_violated: 0,
      source_learning_ids: [],
      created_at: "",
      updated_at: "",
    })
  } else {
    await deps.storage.addLearning({
      id,
      type: mapToLearningType(entryType),
      summary: filtered,
      context: "",
      tool_name: "elf",
      domain: scope,
      tags: [],
      utility_score: 0.5,
      times_consulted: 0,
      context_hash: hash!,
      confidence: 0.7,
      created_at: "",
      updated_at: "",
    })
  }

  return JSON.stringify({ id, status: "added", deduplicated: false })
}

async function handleDeleteRule(deps: ElfToolDeps, args: ElfToolArgs): Promise<string> {
  if (!args.id) {
    return JSON.stringify({ error: "id is required for delete-rule action" })
  }

  if (args.type === "golden_rule") {
    const existing = await deps.storage.getGoldenRule(args.id)
    if (!existing) {
      return JSON.stringify({ error: `Golden rule not found: ${args.id}`, status: "not_found" })
    }
    await deps.storage.deleteGoldenRule(args.id)
    return JSON.stringify({ id: args.id, status: "deleted", type: "golden_rule" })
  }

  if (args.type === "learning") {
    const existing = await deps.storage.getLearning(args.id)
    if (!existing) {
      return JSON.stringify({ error: `Learning not found: ${args.id}`, status: "not_found" })
    }
    await deps.storage.deleteLearning(args.id)
    return JSON.stringify({ id: args.id, status: "deleted", type: "learning" })
  }

  // Auto-detect: try learning first, then golden rule
  const learning = await deps.storage.getLearning(args.id)
  if (learning) {
    await deps.storage.deleteLearning(args.id)
    return JSON.stringify({ id: args.id, status: "deleted", type: "learning" })
  }

  const goldenRule = await deps.storage.getGoldenRule(args.id)
  if (goldenRule) {
    await deps.storage.deleteGoldenRule(args.id)
    return JSON.stringify({ id: args.id, status: "deleted", type: "golden_rule" })
  }

  return JSON.stringify({ error: `Memory item not found: ${args.id}`, status: "not_found" })
}

async function handleUpdateRule(deps: ElfToolDeps, args: ElfToolArgs): Promise<string> {
  if (!args.id) {
    return JSON.stringify({ error: "id is required for update-rule action" })
  }
  if (!args.content) {
    return JSON.stringify({ error: "content is required for update-rule action" })
  }

  const filtered = deps.filterContent(args.content, PRIVACY_TAGS)
  if (isLikelyMemoryDump(filtered)) {
    return JSON.stringify({
      error: "content appears to be a memory dump transcript and was rejected",
      status: "rejected",
    })
  }

  if (args.type === "golden_rule") {
    const existing = await deps.storage.getGoldenRule(args.id)
    if (!existing) {
      return JSON.stringify({ error: `Golden rule not found: ${args.id}`, status: "not_found" })
    }
    const updates: Partial<GoldenRule> = { rule: filtered }
    if (args.scope) updates.domain = args.scope
    await deps.storage.updateGoldenRule(args.id, updates)
    return JSON.stringify({ id: args.id, status: "updated", type: "golden_rule" })
  }

  if (args.type === "learning") {
    const existing = await deps.storage.getLearning(args.id)
    if (!existing) {
      return JSON.stringify({ error: `Learning not found: ${args.id}`, status: "not_found" })
    }
    const updates: Partial<Learning> = { summary: filtered }
    if (args.scope) updates.domain = args.scope
    await deps.storage.updateLearning(args.id, updates)
    return JSON.stringify({ id: args.id, status: "updated", type: "learning" })
  }

  // Auto-detect: try learning first, then golden rule
  const learning = await deps.storage.getLearning(args.id)
  if (learning) {
    const updates: Partial<Learning> = { summary: filtered }
    if (args.scope) updates.domain = args.scope
    await deps.storage.updateLearning(args.id, updates)
    return JSON.stringify({ id: args.id, status: "updated", type: "learning" })
  }

  const goldenRule = await deps.storage.getGoldenRule(args.id)
  if (goldenRule) {
    const updates: Partial<GoldenRule> = { rule: filtered }
    if (args.scope) updates.domain = args.scope
    await deps.storage.updateGoldenRule(args.id, updates)
    return JSON.stringify({ id: args.id, status: "updated", type: "golden_rule" })
  }

  return JSON.stringify({ error: `Memory item not found: ${args.id}`, status: "not_found" })
}

async function handleMetrics(deps: ElfToolDeps): Promise<string> {
  const stats = await deps.storage.getStats()
  return JSON.stringify({
    totalMemories: stats.learnings + stats.goldenRules,
    byType: {
      learnings: stats.learnings,
      golden_rules: stats.goldenRules,
    },
  })
}
