import type { AgentConfig } from "@opencode-ai/sdk"
import type { AgentOverrides } from "../types"
import type { CategoriesConfig, CategoryConfig } from "@/config/schema"
import type { AvailableAgent, AvailableSkill } from "../dynamic-agent-prompt-builder"
import { AGENT_MODEL_REQUIREMENTS } from "@/shared"
import { applyOverrides } from "./agent-overrides"
import { applyModelResolution } from "./model-resolution"
import { createRelayAgent } from "../relay"

export function maybeCreateRelayConfig(input: {
  disabledAgents: string[]
  agentOverrides: AgentOverrides
  uiSelectedModel?: string
  availableModels: Set<string>
  systemDefaultModel?: string
  availableAgents: AvailableAgent[]
  availableSkills: AvailableSkill[]
  mergedCategories: Record<string, CategoryConfig>
  directory?: string
  userCategories?: CategoriesConfig
  useTaskSystem?: boolean
}): AgentConfig | undefined {
  const {
    disabledAgents,
    agentOverrides,
    uiSelectedModel,
    availableModels,
    systemDefaultModel,
    availableAgents,
    availableSkills,
    mergedCategories,
    directory,
    userCategories,
  } = input

  if (disabledAgents.includes("relay")) return undefined

  const orchestratorOverride = agentOverrides["relay"]
  const relayRequirement = AGENT_MODEL_REQUIREMENTS["relay"]

  const relayResolution = applyModelResolution({
    uiSelectedModel: orchestratorOverride?.model ? undefined : uiSelectedModel,
    userModel: orchestratorOverride?.model,
    requirement: relayRequirement,
    availableModels,
    systemDefaultModel,
  })

  if (!relayResolution) return undefined
  const { model: relayModel, variant: relayResolvedVariant } = relayResolution

  let orchestratorConfig = createRelayAgent({
    model: relayModel,
    availableAgents,
    availableSkills,
    userCategories,
  })

  if (relayResolvedVariant) {
    orchestratorConfig = { ...orchestratorConfig, variant: relayResolvedVariant }
  }

  orchestratorConfig = applyOverrides(orchestratorConfig, orchestratorOverride, mergedCategories, directory)

  return orchestratorConfig
}
