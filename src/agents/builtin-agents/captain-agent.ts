import type { AgentConfig } from "@opencode-ai/sdk"
import type { AgentOverrides } from "../types"
import type { CategoriesConfig, CategoryConfig } from "@/config/schema"
import type { AvailableAgent, AvailableCategory, AvailableSkill } from "../dynamic-agent-prompt-builder"
import { AGENT_MODEL_REQUIREMENTS, isAnyFallbackModelAvailable } from "@/shared"
import { applyEnvironmentContext } from "./environment-context"
import { applyOverrides } from "./agent-overrides"
import { applyModelResolution, getFirstFallbackModel } from "./model-resolution"
import { createCaptainAgent } from "../captain"

export function maybeCreateCaptainConfig(input: {
  disabledAgents: string[]
  agentOverrides: AgentOverrides
  uiSelectedModel?: string
  availableModels: Set<string>
  systemDefaultModel?: string
  isFirstRunNoCache: boolean
  availableAgents: AvailableAgent[]
  availableSkills: AvailableSkill[]
  availableCategories: AvailableCategory[]
  mergedCategories: Record<string, CategoryConfig>
  directory?: string
  userCategories?: CategoriesConfig
  useTaskSystem: boolean
  disableCrewEnv?: boolean
}): AgentConfig | undefined {
  const {
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
    useTaskSystem,
    disableCrewEnv = false,
  } = input

  const captainOverride = agentOverrides["captain"]
  const captainRequirement = AGENT_MODEL_REQUIREMENTS["captain"]
  const hasCaptainExplicitConfig = captainOverride !== undefined
  const meetsCaptainAnyModelRequirement =
    !captainRequirement?.requiresAnyModel ||
    hasCaptainExplicitConfig ||
    isFirstRunNoCache ||
    isAnyFallbackModelAvailable(captainRequirement.fallbackChain, availableModels)

  if (disabledAgents.includes("captain") || !meetsCaptainAnyModelRequirement) return undefined

  let captainResolution = applyModelResolution({
    uiSelectedModel: captainOverride?.model ? undefined : uiSelectedModel,
    userModel: captainOverride?.model,
    requirement: captainRequirement,
    availableModels,
    systemDefaultModel,
  })

  if (isFirstRunNoCache && !captainOverride?.model && !uiSelectedModel) {
    captainResolution = getFirstFallbackModel(captainRequirement)
  }

  if (!captainResolution) return undefined
  const { model: captainModel, variant: captainResolvedVariant } = captainResolution

  let captainConfig = createCaptainAgent(
    captainModel,
    availableAgents,
    undefined,
    availableSkills,
    availableCategories,
    useTaskSystem
  )

  if (captainResolvedVariant) {
    captainConfig = { ...captainConfig, variant: captainResolvedVariant }
  }

  captainConfig = applyOverrides(captainConfig, captainOverride, mergedCategories, directory)
  captainConfig = applyEnvironmentContext(captainConfig, directory, {
    disableCrewEnv,
  })

  return captainConfig
}
