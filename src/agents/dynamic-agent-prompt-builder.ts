import type { AgentPromptMetadata } from "./types"
import type { AvailableSkill, AvailableCategory } from "../shared/agent"
import { estimateTokensForContent as estimateTokenCount } from "../shared/token-metrics"

export type { AvailableSkill, AvailableCategory }

export interface AvailableAgent {
  name: string
  description: string
  metadata: AgentPromptMetadata
}

export interface AvailableTool {
  name: string
  category: "lsp" | "ast" | "search" | "session" | "command" | "other"
}
export type PromptSectionPriority = "P0" | "P1" | "P2" | "P3"

export interface PromptSection {
  id: string
  content: string
  priority: PromptSectionPriority
  tags?: string[]
}

type ContextWindowUsage = {
  usedTokens: number
  remainingTokens: number
  usagePercentage: number
}

export interface DynamicAgentPromptBuilderOptions {
  sections: PromptSection[]
  estimateTokens?: (text: string) => number
  getContextWindowUsage?: () => Promise<ContextWindowUsage | null>
}

const PRIORITY_LEVEL: Record<PromptSectionPriority, number> = {
  P0: 0,
  P1: 1,
  P2: 2,
  P3: 3,
}

const VISUAL_ENGINEERING_STRIP_TAGS = ["git", "architecture"]
const ULTRABRAIN_STRIP_TAGS = ["ui", "ui-patterns", "design-ref", "example", "examples"]
const WRITING_STRIP_TAGS = ["git", "architecture", "debugging"]
const FREE_STRIP_TAGS = ["git", "architecture", "debugging", "ui", "ui-patterns", "ui-design", "design-ref", "testing", "example", "examples"]

function hasAnyTag(section: PromptSection, tagsToMatch: string[]): boolean {
  if (!section.tags || section.tags.length === 0) return false
  const loweredTags = section.tags.map((tag) => tag.toLowerCase())
  return loweredTags.some((tag) => tagsToMatch.some((needle) => tag.includes(needle)))
}

function applyCategoryRules(category: string, sections: PromptSection[]): PromptSection[] {
  const normalizedCategory = category.toLowerCase()

  if (normalizedCategory === "quick") {
    return sections.filter((section) => section.priority === "P0")
  }

  if (normalizedCategory === "visual-engineering") {
    return sections.filter((section) => !hasAnyTag(section, VISUAL_ENGINEERING_STRIP_TAGS))
  }

  if (normalizedCategory === "ultrabrain") {
    return sections.filter((section) => !hasAnyTag(section, ULTRABRAIN_STRIP_TAGS))
  }

  if (normalizedCategory === "writing") {
    return sections.filter((section) => !hasAnyTag(section, WRITING_STRIP_TAGS))
  }

  if (normalizedCategory === "free") {
    return sections.filter((section) => !hasAnyTag(section, FREE_STRIP_TAGS))
  }

  return sections
}

function applyPressureRules(contextPressure: number, sections: PromptSection[]): PromptSection[] {
  if (contextPressure > 0.85) {
    return sections.filter((section) => section.priority === "P0")
  }

  if (contextPressure > 0.7) {
    return sections.filter((section) => section.priority === "P0" || section.priority === "P1")
  }

  if (contextPressure > 0.5) {
    return sections.filter((section) => section.priority !== "P3")
  }

  return sections
}

function applyTokenBudget(
  sections: PromptSection[],
  maxPromptTokens: number,
  estimateTokens: (text: string) => number
): PromptSection[] {
  if (!Number.isFinite(maxPromptTokens)) return sections

  const p0Sections = sections.filter((section) => section.priority === "P0")
  const nonP0Sections = sections
    .map((section, index) => ({ section, index }))
    .filter(({ section }) => section.priority !== "P0")
    .sort((a, b) => {
      const rankDiff = PRIORITY_LEVEL[a.section.priority] - PRIORITY_LEVEL[b.section.priority]
      if (rankDiff !== 0) return rankDiff
      return a.index - b.index
    })

  const selectedIds = new Set(p0Sections.map((section) => section.id))
  const p0TokenCount = p0Sections.reduce((sum, section) => sum + estimateTokens(section.content), 0)
  let remainingBudget = Math.max(0, Math.floor(maxPromptTokens) - p0TokenCount)

  for (const { section } of nonP0Sections) {
    const sectionTokens = estimateTokens(section.content)
    if (sectionTokens <= remainingBudget) {
      selectedIds.add(section.id)
      remainingBudget -= sectionTokens
    }
  }

  return sections.filter((section) => selectedIds.has(section.id))
}

export class DynamicAgentPromptBuilder {
  private readonly sections: PromptSection[]
  private readonly estimateTokens: (text: string) => number
  private readonly getContextWindowUsage?: () => Promise<ContextWindowUsage | null>

  constructor(options: DynamicAgentPromptBuilderOptions) {
    this.sections = options.sections
    this.estimateTokens = options.estimateTokens ?? estimateTokenCount
    this.getContextWindowUsage = options.getContextWindowUsage
  }

  build(): string {
    return this.sections.map((section) => section.content).join("\n\n")
  }

  buildWithSizing(
    category: string,
    contextPressure: number,
    memoryTokens = 0,
    remainingTokens?: number
  ): string {
    const categoryFilteredSections = applyCategoryRules(category, this.sections)
    const pressureFilteredSections = applyPressureRules(contextPressure, categoryFilteredSections)

    const hasRemainingTokens = typeof remainingTokens === "number" && Number.isFinite(remainingTokens)
    const memoryCost = Math.max(0, Math.floor(memoryTokens))
    const maxPromptTokens = hasRemainingTokens
      ? Math.max(0, Math.floor(remainingTokens * 0.3) - memoryCost)
      : Number.POSITIVE_INFINITY

    const budgetedSections = applyTokenBudget(
      pressureFilteredSections,
      maxPromptTokens,
      this.estimateTokens
    )

    return budgetedSections.map((section) => section.content).join("\n\n")
  }

  async buildWithAutoSizing(category: string, memoryTokens = 0): Promise<string> {
    if (!this.getContextWindowUsage) {
      return this.buildWithSizing(category, 0, memoryTokens)
    }

    const usage = await this.getContextWindowUsage()
    if (!usage) {
      return this.buildWithSizing(category, 0, memoryTokens)
    }

    return this.buildWithSizing(
      category,
      usage.usagePercentage,
      memoryTokens,
      usage.remainingTokens
    )
  }
}

export function categorizeTools(toolNames: string[]): AvailableTool[] {
  return toolNames.map((name) => {
    let category: AvailableTool["category"] = "other"
    if (name.startsWith("lsp_")) {
      category = "lsp"
    } else if (name.startsWith("ast_grep")) {
      category = "ast"
    } else if (name === "grep" || name === "glob") {
      category = "search"
    } else if (name.startsWith("session_")) {
      category = "session"
    } else if (name === "skill") {
      category = "command"
    }
    return { name, category }
  })
}

function formatToolsForPrompt(tools: AvailableTool[]): string {
  const lspTools = tools.filter((t) => t.category === "lsp")
  const astTools = tools.filter((t) => t.category === "ast")
  const searchTools = tools.filter((t) => t.category === "search")

  const parts: string[] = []

  if (searchTools.length > 0) {
    parts.push(...searchTools.map((t) => `\`${t.name}\``))
  }

  if (lspTools.length > 0) {
    parts.push("`lsp_*`")
  }

  if (astTools.length > 0) {
    parts.push("`ast_grep`")
  }

  return parts.join(", ")
}

export function buildKeyTriggersSection(agents: AvailableAgent[], _skills: AvailableSkill[] = []): string {
  const keyTriggers = agents
    .filter((a) => a.metadata.keyTrigger)
    .map((a) => `- ${a.metadata.keyTrigger}`)

  if (keyTriggers.length === 0) return ""

  return `### Key Triggers (check BEFORE classification):

${keyTriggers.join("\n")}
- **"Look into" + "create PR"** → Not just research. Full implementation cycle expected.`
}

export function buildToolSelectionTable(
  agents: AvailableAgent[],
  tools: AvailableTool[] = [],
  _skills: AvailableSkill[] = []
): string {
  const rows: string[] = [
    "### Tool & Agent Selection:",
    "",
  ]

  if (tools.length > 0) {
    const toolsDisplay = formatToolsForPrompt(tools)
    rows.push(`- ${toolsDisplay} — **FREE** — Not Complex, Scope Clear, No Implicit Assumptions`)
  }

  const costOrder = { FREE: 0, CHEAP: 1, EXPENSIVE: 2 }
  const sortedAgents = [...agents]
    .filter((a) => a.metadata.category !== "utility")
    .sort((a, b) => costOrder[a.metadata.cost] - costOrder[b.metadata.cost])

  for (const agent of sortedAgents) {
    const shortDesc = agent.description.split(".")[0] || agent.description
    rows.push(`- \`${agent.name}\` agent — **${agent.metadata.cost}** — ${shortDesc}`)
  }

  rows.push("")
  rows.push("**Default flow**: lookout/archivist (background) + tools → sage (if required)")

  return rows.join("\n")
}

export function buildLookoutSection(agents: AvailableAgent[]): string {
  const lookoutAgent = agents.find((a) => a.name === "lookout")
  if (!lookoutAgent) return ""

  const useWhen = lookoutAgent.metadata.useWhen || []
  const avoidWhen = lookoutAgent.metadata.avoidWhen || []

  return `### Lookout Agent = Contextual Grep

Use it as a **peer tool**, not a fallback. Fire liberally.

**Use Direct Tools when:**
${avoidWhen.map((w) => `- ${w}`).join("\n")}

**Use Lookout Agent when:**
${useWhen.map((w) => `- ${w}`).join("\n")}`
}

export function buildArchivistSection(agents: AvailableAgent[]): string {
  const archivistAgent = agents.find((a) => a.name === "archivist")
  if (!archivistAgent) return ""

  const useWhen = archivistAgent.metadata.useWhen || []

  return `### Archivist Agent = Reference Grep

Search **external references** (docs, OSS, web). Fire proactively when unfamiliar libraries are involved.

**Contextual Grep (Internal)** — search OUR codebase, find patterns in THIS repo, project-specific logic.
**Reference Grep (External)** — search EXTERNAL resources, official API docs, library best practices, OSS implementation examples.

**Trigger phrases** (fire archivist immediately):
${useWhen.map((w) => `- "${w}"`).join("\n")}`
}

export function buildDelegationTable(agents: AvailableAgent[]): string {
  const rows: string[] = [
    "### Delegation Table:",
    "",
  ]

  for (const agent of agents) {
    for (const trigger of agent.metadata.triggers) {
      rows.push(`- **${trigger.domain}** → \`${agent.name}\` — ${trigger.trigger}`)
    }
  }

  return rows.join("\n")
}


export function buildCategorySkillsDelegationGuide(categories: AvailableCategory[], skills: AvailableSkill[]): string {
  if (categories.length === 0 && skills.length === 0) return ""

  const categoryRows = categories.map((c) => {
    const desc = c.description || c.name
    return `- \`${c.name}\` — ${desc}`
  })

  const builtinSkills = skills.filter((s) => s.location === "plugin")
  const customSkills = skills.filter((s) => s.location !== "plugin")

  const builtinNames = builtinSkills.map((s) => s.name).join(", ")
  const customNames = customSkills.map((s) => {
    const source = s.location === "project" ? "project" : "user"
    return `${s.name} (${source})`
  }).join(", ")

  let skillsSection: string

  if (customSkills.length > 0 && builtinSkills.length > 0) {
    skillsSection = `#### Available Skills (via \`skill\` tool)

**Built-in**: ${builtinNames}
**⚡ YOUR SKILLS (PRIORITY)**: ${customNames}

> User-installed skills OVERRIDE built-in defaults. ALWAYS prefer YOUR SKILLS when domain matches.
> Full skill descriptions → use the \`skill\` tool to check before EVERY delegation.`
  } else if (customSkills.length > 0) {
    skillsSection = `#### Available Skills (via \`skill\` tool)

**⚡ YOUR SKILLS (PRIORITY)**: ${customNames}

> User-installed skills OVERRIDE built-in defaults. ALWAYS prefer YOUR SKILLS when domain matches.
> Full skill descriptions → use the \`skill\` tool to check before EVERY delegation.`
  } else if (builtinSkills.length > 0) {
    skillsSection = `#### Available Skills (via \`skill\` tool)

**Built-in**: ${builtinNames}

> Full skill descriptions → use the \`skill\` tool to check before EVERY delegation.`
  } else {
    skillsSection = ""
  }

  return `### Category + Skills Delegation System

**task() combines categories and skills for optimal task execution.**

#### Available Categories (Domain-Optimized Models)

Each category is configured with a model optimized for that domain. Read the description to understand when to use it.

${categoryRows.join("\n")}

${skillsSection}

---

### MANDATORY: Category + Skill Selection Protocol

**STEP 1: Select Category**
- Read each category's description
- Match task requirements to category domain
- Select the category whose domain BEST fits the task

**STEP 2: Evaluate ALL Skills**
Check the \`skill\` tool for available skills and their descriptions. For EVERY skill, ask:
> "Does this skill's expertise domain overlap with my task?"

- If YES → INCLUDE in \`load_skills=[...]\`
- If NO → OMIT (no justification needed)
${customSkills.length > 0 ? `
> **User-installed skills get PRIORITY.** When in doubt, INCLUDE rather than omit.` : ""}

---

### Delegation Pattern

\`\`\`typescript
task(
  category="[selected-category]",
  load_skills=["skill-1", "skill-2"],  // Include ALL relevant skills — ESPECIALLY user-installed ones
  prompt="..."
)
\`\`\`

**ANTI-PATTERN (will produce poor results):**
\`\`\`typescript
task(category="...", load_skills=[], run_in_background=false, prompt="...")  // Empty load_skills without justification
\`\`\``
}

export function buildSageSection(agents: AvailableAgent[]): string {
  const sageAgent = agents.find((a) => a.name === "sage")
  if (!sageAgent) return ""

  const useWhen = sageAgent.metadata.useWhen || []
  const avoidWhen = sageAgent.metadata.avoidWhen || []

  return `<Sage_Usage>
## Sage — Read-Only High-IQ Consultant

Sage is a read-only, expensive, high-quality reasoning model for debugging and architecture. Consultation only.

### WHEN to Consult (Sage FIRST, then implement):

${useWhen.map((w) => `- ${w}`).join("\n")}

### WHEN NOT to Consult:

${avoidWhen.map((w) => `- ${w}`).join("\n")}

### Usage Pattern:
Briefly announce "Consulting Sage for [reason]" before invocation.

**Exception**: This is the ONLY case where you announce before acting. For all other work, start immediately without status updates.

### Sage Background Task Policy:

**Collect Sage results before your final answer. No exceptions.**

- Sage takes minutes. When done with your own work: **end your response** — wait for the \`<system-reminder>\`.
- Do NOT poll \`background_output\` on a running Sage. The notification will come.
- Never cancel Sage.
</Sage_Usage>`
}

export function buildHardBlocksSection(): string {
  const blocks = [
    "- Type error suppression (`as any`, `@ts-ignore`) — **Never**",
    "- Commit without explicit request — **Never**",
    "- Speculate about unread code — **Never**",
    "- Leave code in broken state after failures — **Never**",
    "- `background_cancel(all=true)` — **Never.** Always cancel individually by taskId.",
    "- Delivering final answer before collecting Sage result — **Never.**",
  ]

  return `## Hard Blocks (NEVER violate)

${blocks.join("\n")}`
}

export function buildAntiPatternsSection(): string {
  const patterns = [
    "- **Type Safety**: `as any`, `@ts-ignore`, `@ts-expect-error`",
    "- **Error Handling**: Empty catch blocks `catch(e) {}`",
    "- **Testing**: Deleting failing tests to \"pass\"",
    "- **Search**: Firing agents for single-line typos or obvious syntax errors",
    "- **Debugging**: Shotgun debugging, random changes",
    "- **Background Tasks**: Polling `background_output` on running tasks — end response and wait for notification",
    "- **Sage**: Delivering answer without collecting Sage results",
  ]

  return `## Anti-Patterns (BLOCKING violations)

${patterns.join("\n")}`
}

export function buildNonClaudePlannerSection(model: string): string {
  const isNonClaude = !model.toLowerCase().includes('claude')
  if (!isNonClaude) return ""

  return `### Plan Agent Dependency (Non-Claude)

Multi-step task? **ALWAYS consult Plan Agent first.** Do NOT start implementation without a plan.

- Single-file fix or trivial change → proceed directly
- Anything else (2+ steps, unclear scope, architecture) → \`task(subagent_type="plan", ...)\` FIRST
- Use \`session_id\` to resume the same Plan Agent — ask follow-up questions aggressively
- If ANY part of the task is ambiguous, ask Plan Agent before guessing

Plan Agent returns a structured work breakdown with parallel execution opportunities. Follow it.`
}

export function buildDeepParallelSection(model: string, categories: AvailableCategory[]): string {
  const isNonClaude = !model.toLowerCase().includes('claude')
  const hasDeepCategory = categories.some(c => c.name === 'deep')

  if (!isNonClaude || !hasDeepCategory) return ""

  return `### Deep Parallel Delegation

Delegate EVERY independent unit to a \`deep\` agent in parallel (\`run_in_background=true\`).
If a task decomposes into 4 independent units, spawn 4 agents simultaneously — not 1 at a time.

1. Decompose the implementation into independent work units
2. Assign one \`deep\` agent per unit — all via \`run_in_background=true\`
3. Give each agent a clear GOAL with success criteria, not step-by-step instructions
4. Collect all results, integrate, verify coherence across units`
}

export function buildUltraworkSection(
  agents: AvailableAgent[],
  categories: AvailableCategory[],
  skills: AvailableSkill[]
): string {
  const lines: string[] = []

  if (categories.length > 0) {
    lines.push("**Categories** (for implementation tasks):")
    for (const cat of categories) {
      const shortDesc = cat.description || cat.name
      lines.push(`- \`${cat.name}\`: ${shortDesc}`)
    }
    lines.push("")
  }

  if (skills.length > 0) {
    const builtinSkills = skills.filter((s) => s.location === "plugin")
    const customSkills = skills.filter((s) => s.location !== "plugin")

    if (builtinSkills.length > 0) {
      lines.push("**Built-in Skills** (combine with categories):")
      for (const skill of builtinSkills) {
        const shortDesc = skill.description.split(".")[0] || skill.description
        lines.push(`- \`${skill.name}\`: ${shortDesc}`)
      }
      lines.push("")
    }

    if (customSkills.length > 0) {
      lines.push("**User-Installed Skills** (HIGH PRIORITY - user installed these for their workflow):")
      for (const skill of customSkills) {
        const shortDesc = skill.description.split(".")[0] || skill.description
        lines.push(`- \`${skill.name}\`: ${shortDesc}`)
      }
      lines.push("")
    }
  }

  if (agents.length > 0) {
    const ultraworkAgentPriority = ["lookout", "archivist", "plan", "sage"]
    const sortedAgents = [...agents].sort((a, b) => {
      const aIdx = ultraworkAgentPriority.indexOf(a.name)
      const bIdx = ultraworkAgentPriority.indexOf(b.name)
      if (aIdx === -1 && bIdx === -1) return 0
      if (aIdx === -1) return 1
      if (bIdx === -1) return -1
      return aIdx - bIdx
    })

    lines.push("**Agents** (for specialized consultation/exploration):")
    for (const agent of sortedAgents) {
      const shortDesc = agent.description.length > 120 ? agent.description.slice(0, 120) + "..." : agent.description
      const suffix = agent.name === "lookout" || agent.name === "archivist" ? " (multiple)" : ""
      lines.push(`- \`${agent.name}${suffix}\`: ${shortDesc}`)
    }
  }

  return lines.join("\n")
}
