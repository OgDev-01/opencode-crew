import type { AgentConfig } from "@opencode-ai/sdk"
import type { AgentFactory } from "./types"
import type { CategoriesConfig, CategoryConfig, GitMasterConfig } from "../config/schema"
import type { BrowserAutomationProvider } from "../config/schema"
import type { SkillResolver } from "../shared/agent"
import { mergeCategories } from "../shared/config/merge-categories"

export type AgentSource = AgentFactory | AgentConfig

export function isFactory(source: AgentSource): source is AgentFactory {
  return typeof source === "function"
}

export function buildAgent(
  source: AgentSource,
  model: string,
  categories?: CategoriesConfig,
  gitMasterConfig?: GitMasterConfig,
  browserProvider?: BrowserAutomationProvider,
  disabledSkills?: Set<string>,
  skillResolver?: SkillResolver
): AgentConfig {
  const base = isFactory(source) ? source(model) : { ...source }
  const categoryConfigs: Record<string, CategoryConfig> = mergeCategories(categories)

  const agentWithCategory = base as AgentConfig & { category?: string; skills?: string[]; variant?: string }
  if (agentWithCategory.category) {
    const categoryConfig = categoryConfigs[agentWithCategory.category]
    if (categoryConfig) {
      if (!base.model) {
        base.model = categoryConfig.model
      }
      if (base.temperature === undefined && categoryConfig.temperature !== undefined) {
        base.temperature = categoryConfig.temperature
      }
      if (base.variant === undefined && categoryConfig.variant !== undefined) {
        base.variant = categoryConfig.variant
      }
    }
  }

  if (agentWithCategory.skills?.length) {
    const resolver = skillResolver ?? resolveMultipleSkillsFallback
    const { resolved } = resolver(agentWithCategory.skills, { gitMasterConfig, browserProvider, disabledSkills })
    if (resolved.size > 0) {
      const skillContent = Array.from(resolved.values()).join("\n\n")
      base.prompt = skillContent + (base.prompt ? "\n\n" + base.prompt : "")
    }
  }

  return base
}

/**
 * Lazy-loaded fallback for resolveMultipleSkills when no DI resolver is provided.
 * Uses synchronous require to avoid making buildAgent async.
 */
let _cachedResolver: SkillResolver | null = null
function resolveMultipleSkillsFallback(
  skillNames: string[],
  options?: { gitMasterConfig?: unknown; browserProvider?: string; disabledSkills?: Set<string> }
): { resolved: Map<string, string>; notFound: string[] } {
  if (!_cachedResolver) {
    try {
      const mod = require("../features/opencode-skill-loader/skill-content")
      _cachedResolver = mod.resolveMultipleSkills
    } catch {
      return { resolved: new Map(), notFound: skillNames }
    }
  }
  return _cachedResolver!(skillNames, options)
}
