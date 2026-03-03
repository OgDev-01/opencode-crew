import type { AgentConfig } from "@opencode-ai/sdk"
import type { AgentOverrides } from "../types"
import type { CategoryConfig } from "@/config/schema"
import type { AvailableAgent, AvailableCategory, AvailableSkill } from "../dynamic-agent-prompt-builder"
import { AGENT_MODEL_REQUIREMENTS, isAnyProviderConnected } from "@/shared"
import { createCraftsmanAgent } from "../craftsman"
import { applyEnvironmentContext } from "./environment-context"
import { applyCategoryOverride, mergeAgentConfig } from "./agent-overrides"
import { applyModelResolution, getFirstFallbackModel } from "./model-resolution"

export function maybeCreateCraftsmanConfig(input: {
  disabledAgents: string[]
  agentOverrides: AgentOverrides
  availableModels: Set<string>
  systemDefaultModel?: string
  isFirstRunNoCache: boolean
  availableAgents: AvailableAgent[]
  availableSkills: AvailableSkill[]
  availableCategories: AvailableCategory[]
  mergedCategories: Record<string, CategoryConfig>
  directory?: string
  useTaskSystem: boolean
  disableCrewEnv?: boolean
}): AgentConfig | undefined {
  const {
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
    disableCrewEnv = false,
  } = input

  if (disabledAgents.includes("craftsman")) return undefined

  const craftsmanOverride = agentOverrides["craftsman"]
  const craftsmanRequirement = AGENT_MODEL_REQUIREMENTS["craftsman"]
  const hasCraftsmanExplicitConfig = craftsmanOverride !== undefined

  const hasRequiredProvider =
    !craftsmanRequirement?.requiresProvider ||
    hasCraftsmanExplicitConfig ||
    isFirstRunNoCache ||
    isAnyProviderConnected(craftsmanRequirement.requiresProvider, availableModels)

  if (!hasRequiredProvider) return undefined

  let craftsmanResolution = applyModelResolution({
    userModel: craftsmanOverride?.model,
    requirement: craftsmanRequirement,
    availableModels,
    systemDefaultModel,
  })

  if (isFirstRunNoCache && !craftsmanOverride?.model) {
    craftsmanResolution = getFirstFallbackModel(craftsmanRequirement)
  }

  if (!craftsmanResolution) return undefined
  const { model: craftsmanModel, variant: craftsmanResolvedVariant } = craftsmanResolution

  let craftsmanConfig = createCraftsmanAgent(
    craftsmanModel,
    availableAgents,
    undefined,
    availableSkills,
    availableCategories,
    useTaskSystem
  )

  craftsmanConfig = { ...craftsmanConfig, variant: craftsmanResolvedVariant ?? "medium" }

  const craftOverrideCategory = (craftsmanOverride as Record<string, unknown> | undefined)?.category as string | undefined
  if (craftOverrideCategory) {
    craftsmanConfig = applyCategoryOverride(craftsmanConfig, craftOverrideCategory, mergedCategories)
  }

  craftsmanConfig = applyEnvironmentContext(craftsmanConfig, directory, { disableCrewEnv })

  if (craftsmanOverride) {
    craftsmanConfig = mergeAgentConfig(craftsmanConfig, craftsmanOverride, directory)
  }
  return craftsmanConfig
}
