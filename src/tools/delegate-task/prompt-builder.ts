import type { BuildSystemContentInput } from "./types"
import { buildPlanAgentSystemPrepend, isPlanAgent } from "./constants"
import { buildSystemContentWithTokenLimit } from "./token-limiter"

const FREE_OR_LOCAL_PROMPT_TOKEN_LIMIT = 24000

const BROWSER_SKILLS = new Set(["playwright", "dev-browser", "agent-browser"])
const BROWSER_TOOLS = ["skill_mcp"]

const CATEGORY_TOOL_MAP: Record<string, string[]> = {
  quick: ["edit", "write", "read", "bash"],
  "visual-engineering": [
    "edit", "write", "read", "glob", "bash",
    "lsp_diagnostics", "lsp_goto_definition", "lsp_find_references", "lsp_symbols",
  ],
  ultrabrain: [
    "read", "grep", "mgrep",
    "lsp_diagnostics", "lsp_find_references", "lsp_symbols", "lsp_goto_definition",
    "ast_grep_search", "ast_grep_replace",
  ],
}

export interface BuildSystemContentWithCategoryInput extends BuildSystemContentInput {
  category?: string
  loadedSkills?: string[]
}

export function getToolsForCategory(
  category: string,
  loadedSkills?: string[],
): string[] | undefined {
  if (category === "deep") {
    return undefined
  }

  const baseTools = CATEGORY_TOOL_MAP[category]
  if (!baseTools) {
    return undefined
  }

  const hasBrowserSkill = loadedSkills?.some((skill) => BROWSER_SKILLS.has(skill))
  if (!hasBrowserSkill) {
    return baseTools
  }

  return [...baseTools, ...BROWSER_TOOLS]
}

function buildToolGuidance(tools: string[]): string {
  const toolList = tools.join(", ")
  return `<Tool_Guidance>
Focus on these tools for this task: ${toolList}
Other tools remain available but are unlikely to be needed.
</Tool_Guidance>`
}

function usesFreeOrLocalModel(model: { providerID: string; modelID: string; variant?: string } | undefined): boolean {
  if (!model) {
    return false
  }

  const provider = model.providerID.toLowerCase()
  const modelId = model.modelID.toLowerCase()
  return provider.includes("local")
    || provider === "ollama"
    || provider === "lmstudio"
    || modelId.includes("free")
}

/**
 * Build the system content to inject into the agent prompt.
 * Combines skill content, category prompt append, tool guidance, and plan agent system prepend.
 * When a category is provided, injects focused tool guidance to reduce noise.
 */
export function buildSystemContent(input: BuildSystemContentWithCategoryInput): string | undefined {
  const {
    skillContent,
    skillContents,
    categoryPromptAppend,
    agentsContext,
    maxPromptTokens,
    model,
    agentName,
    availableCategories,
    availableSkills,
    category,
    loadedSkills,
  } = input

  const planAgentPrepend = isPlanAgent(agentName)
    ? buildPlanAgentSystemPrepend(availableCategories, availableSkills)
    : ""

  const effectiveMaxPromptTokens = maxPromptTokens
    ?? (usesFreeOrLocalModel(model) ? FREE_OR_LOCAL_PROMPT_TOKEN_LIMIT : undefined)

  const toolGuidance = category
    ? buildToolGuidanceForCategory(category, loadedSkills)
    : undefined

  const enhancedCategoryPromptAppend = toolGuidance && categoryPromptAppend
    ? `${categoryPromptAppend}\n\n${toolGuidance}`
    : toolGuidance ?? categoryPromptAppend

  return buildSystemContentWithTokenLimit(
    {
      skillContent,
      skillContents,
      categoryPromptAppend: enhancedCategoryPromptAppend,
      agentsContext: agentsContext ?? planAgentPrepend,
      planAgentPrepend,
    },
    effectiveMaxPromptTokens
  )
}

function buildToolGuidanceForCategory(category: string, loadedSkills?: string[]): string | undefined {
  const tools = getToolsForCategory(category, loadedSkills)
  if (!tools) {
    return undefined
  }
  return buildToolGuidance(tools)
}
