import type { AgentConfig } from "@opencode-ai/sdk"
import type { BuiltinAgentName, AgentOverrides, AgentFactory, AgentPromptMetadata } from "./types"
import type { CategoriesConfig, GitMasterConfig } from "../config/schema"
import type { AgentLoadedSkill, AgentBuiltinSkill, BuiltinSkillFactory } from "../shared/agent"
import type { BrowserAutomationProvider } from "../config/schema"
import { createCaptainAgent } from "./captain"
import { createSageAgent, SAGE_PROMPT_METADATA } from "./sage"
import { createArchivistAgent, ARCHIVIST_PROMPT_METADATA } from "./archivist"
import { createLookoutAgent, LOOKOUT_PROMPT_METADATA } from "./lookout"
import { createSpotterAgent, SPOTTER_PROMPT_METADATA } from "./spotter"
import { createAssessorAgent, assessorPromptMetadata } from "./assessor"
import { createRelayAgent, relayPromptMetadata } from "./relay"
import { createCriticAgent, criticPromptMetadata } from "./critic"
import { createCraftsmanAgent } from "./craftsman"
import type { AvailableCategory } from "./dynamic-agent-prompt-builder"
import {
  fetchAvailableModels,
  readConnectedProvidersCache,
  readProviderModelsCache,
} from "../shared"
import { CATEGORY_DESCRIPTIONS } from "../shared/agent"
import { mergeCategories } from "../shared/config/merge-categories"
import { buildAvailableSkills } from "./builtin-agents/available-skills"
import { collectPendingBuiltinAgents } from "./builtin-agents/general-agents"
import { maybeCreateCaptainConfig } from "./builtin-agents/captain-agent"
import { maybeCreateCraftsmanConfig } from "./builtin-agents/craftsman-agent"
import { maybeCreateRelayConfig } from "./builtin-agents/relay-agent"
import { buildCustomAgentMetadata, parseRegisteredAgentSummaries } from "./custom-agent-summaries"

type AgentSource = AgentFactory | AgentConfig

const agentSources: Record<BuiltinAgentName, AgentSource> = {
  captain: createCaptainAgent,
  craftsman: createCraftsmanAgent,
  sage: createSageAgent,
  archivist: createArchivistAgent,
  lookout: createLookoutAgent,
  "spotter": createSpotterAgent,
  assessor: createAssessorAgent,
  critic: createCriticAgent,
  // Note: Relay is handled specially in createBuiltinAgents()
  // because it needs OrchestratorContext, not just a model string
  relay: createRelayAgent as AgentFactory,
}

/**
 * Metadata for each agent, used to build Captain's dynamic prompt sections
 * (Delegation Table, Tool Selection, Key Triggers, etc.)
 */
const agentMetadata: Partial<Record<BuiltinAgentName, AgentPromptMetadata>> = {
  sage: SAGE_PROMPT_METADATA,
  archivist: ARCHIVIST_PROMPT_METADATA,
  lookout: LOOKOUT_PROMPT_METADATA,
  "spotter": SPOTTER_PROMPT_METADATA,
  assessor: assessorPromptMetadata,
  critic: criticPromptMetadata,
  relay: relayPromptMetadata,
}

export async function createBuiltinAgents(
  disabledAgents: string[] = [],
  agentOverrides: AgentOverrides = {},
  directory?: string,
  systemDefaultModel?: string,
  categories?: CategoriesConfig,
  gitMasterConfig?: GitMasterConfig,
  discoveredSkills: AgentLoadedSkill[] = [],
  customAgentSummaries?: unknown,
  browserProvider?: BrowserAutomationProvider,
  uiSelectedModel?: string,
  disabledSkills?: Set<string>,
  useTaskSystem = false,
  disableCrewEnv = false,
  builtinSkillFactory?: BuiltinSkillFactory
): Promise<Record<string, AgentConfig>> {

  const connectedProviders = readConnectedProvidersCache()
  const providerModelsConnected = connectedProviders
    ? (readProviderModelsCache()?.connected ?? [])
    : []
  const mergedConnectedProviders = Array.from(
    new Set([...(connectedProviders ?? []), ...providerModelsConnected])
  )
  // IMPORTANT: Do NOT call OpenCode client APIs during plugin initialization.
  // This function is called from config handler, and calling client API causes deadlock.
  // See: https://github.com/OgDev-01/opencode-crew/issues/1301
  const availableModels = await fetchAvailableModels(undefined, {
    connectedProviders: mergedConnectedProviders.length > 0 ? mergedConnectedProviders : undefined,
  })
  const isFirstRunNoCache =
    availableModels.size === 0 && mergedConnectedProviders.length === 0

  const result: Record<string, AgentConfig> = {}

  const mergedCategories = mergeCategories(categories)

  const availableCategories: AvailableCategory[] = Object.entries(mergedCategories).map(([name]) => ({
    name,
    description: categories?.[name]?.description ?? CATEGORY_DESCRIPTIONS[name] ?? "General tasks",
  }))

  const builtinSkills = builtinSkillFactory
    ? builtinSkillFactory({ browserProvider, disabledSkills })
    : (await import("../features/builtin-skills")).createBuiltinSkills({ browserProvider, disabledSkills })
  const availableSkills = buildAvailableSkills(discoveredSkills, builtinSkills, disabledSkills)

  // Collect general agents first (for availableAgents), but don't add to result yet
  const { pendingAgentConfigs, availableAgents } = collectPendingBuiltinAgents({
    agentSources,
    agentMetadata,
    disabledAgents,
    agentOverrides,
    directory,
    systemDefaultModel,
    mergedCategories,
    gitMasterConfig,
    browserProvider,
    uiSelectedModel,
    availableModels,
    disabledSkills,
    disableCrewEnv,
  })

  const registeredAgents = parseRegisteredAgentSummaries(customAgentSummaries)
  const builtinAgentNames = new Set(Object.keys(agentSources).map((name) => name.toLowerCase()))
  const disabledAgentNames = new Set(disabledAgents.map((name) => name.toLowerCase()))

  for (const agent of registeredAgents) {
    const lowerName = agent.name.toLowerCase()
    if (builtinAgentNames.has(lowerName)) continue
    if (disabledAgentNames.has(lowerName)) continue
    if (availableAgents.some((availableAgent) => availableAgent.name.toLowerCase() === lowerName)) continue

    availableAgents.push({
      name: agent.name,
      description: agent.description,
      metadata: buildCustomAgentMetadata(agent.name, agent.description),
    })
  }

  const captainConfig = maybeCreateCaptainConfig({
    disabledAgents,
    agentOverrides,
    uiSelectedModel,
    availableModels,
    systemDefaultModel,
    isFirstRunNoCache,
    availableAgents,
    availableSkills,
    availableCategories,
    mergedCategories,
    directory,
    userCategories: categories,
    useTaskSystem,
    disableCrewEnv,
  })
  if (captainConfig) {
    result["captain"] = captainConfig
  }

  const craftsmanConfig = maybeCreateCraftsmanConfig({
    disabledAgents,
    agentOverrides,
    availableModels,
    systemDefaultModel,
    isFirstRunNoCache,
    availableAgents,
    availableSkills,
    availableCategories,
    mergedCategories,
    directory,
    useTaskSystem,
    disableCrewEnv,
  })
  if (craftsmanConfig) {
    result["craftsman"] = craftsmanConfig
  }

  // Add pending agents after captain and craftsman to maintain order
  for (const [name, config] of pendingAgentConfigs) {
    result[name] = config
  }

  const relayConfig = maybeCreateRelayConfig({
    disabledAgents,
    agentOverrides,
    uiSelectedModel,
    availableModels,
    systemDefaultModel,
    availableAgents,
    availableSkills,
    mergedCategories,
    directory,
    userCategories: categories,
  })
  if (relayConfig) {
    result["relay"] = relayConfig
  }

  return result
}
