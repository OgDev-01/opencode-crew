import { createBuiltinAgents } from "../agents";
import { createCadetAgentWithOverrides } from "../agents/cadet";
import type { OpenCodeCrewConfig } from "../config";
import { log, migrateAgentConfig } from "../shared";
import { AGENT_NAME_MAP } from "../shared/migration";
import { getAgentDisplayName } from "../shared/agent/agent-display-names";
import {
  discoverConfigSourceSkills,
  discoverOpencodeGlobalSkills,
  discoverOpencodeProjectSkills,
  discoverProjectClaudeSkills,
  discoverUserClaudeSkills,
} from "../features/opencode-skill-loader";
import { loadProjectAgents, loadUserAgents } from "../features/claude-code-agent-loader";
import type { PluginComponents } from "./plugin-components-loader";
import { reorderAgentsByPriority } from "./agent-priority-order";
import { remapAgentKeysToDisplayNames } from "./agent-key-remapper";
import { buildStrategistAgentConfig } from "./strategist-agent-config-builder";
import { buildPlanDemoteConfig } from "./plan-model-inheritance";

type AgentConfigRecord = Record<string, Record<string, unknown> | undefined> & {
  build?: Record<string, unknown>;
  plan?: Record<string, unknown>;
};

function getConfiguredDefaultAgent(config: Record<string, unknown>): string | undefined {
  const defaultAgent = config.default_agent;
  if (typeof defaultAgent !== "string") return undefined;

  const trimmedDefaultAgent = defaultAgent.trim();
  return trimmedDefaultAgent.length > 0 ? trimmedDefaultAgent : undefined;
}

export async function applyAgentConfig(params: {
  config: Record<string, unknown>;
  pluginConfig: OpenCodeCrewConfig;
  ctx: { directory: string; client?: any };
  pluginComponents: PluginComponents;
}): Promise<Record<string, unknown>> {
  const migratedDisabledAgents = (params.pluginConfig.disabled_agents ?? []).map(
    (agent) => {
      return AGENT_NAME_MAP[agent.toLowerCase()] ?? AGENT_NAME_MAP[agent] ?? agent;
    },
  ) as typeof params.pluginConfig.disabled_agents;

  const includeClaudeSkillsForAwareness = params.pluginConfig.claude_code?.skills ?? true;
  const [
    discoveredConfigSourceSkills,
    discoveredUserSkills,
    discoveredProjectSkills,
    discoveredOpencodeGlobalSkills,
    discoveredOpencodeProjectSkills,
  ] = await Promise.all([
    discoverConfigSourceSkills({
      config: params.pluginConfig.skills,
      configDir: params.ctx.directory,
    }),
    includeClaudeSkillsForAwareness ? discoverUserClaudeSkills() : Promise.resolve([]),
    includeClaudeSkillsForAwareness
       ? discoverProjectClaudeSkills(params.ctx.directory)
       : Promise.resolve([]),
    discoverOpencodeGlobalSkills(),
    discoverOpencodeProjectSkills(params.ctx.directory),
  ]);

  const allDiscoveredSkills = [
    ...discoveredConfigSourceSkills,
    ...discoveredOpencodeProjectSkills,
    ...discoveredProjectSkills,
    ...discoveredOpencodeGlobalSkills,
    ...discoveredUserSkills,
  ];

  const browserProvider =
    params.pluginConfig.browser_automation_engine?.provider ?? "playwright";
  const currentModel = params.config.model as string | undefined;
  const disabledSkills = new Set<string>(params.pluginConfig.disabled_skills ?? []);
  const useTaskSystem = params.pluginConfig.experimental?.task_system ?? false;
  const disableCrewEnv = params.pluginConfig.experimental?.disable_crew_env ?? false;

  const builtinAgents = await createBuiltinAgents(
    migratedDisabledAgents,
    params.pluginConfig.agents,
    params.ctx.directory,
    currentModel,
    params.pluginConfig.categories,
    params.pluginConfig.git_master,
    allDiscoveredSkills,
    params.ctx.client,
    browserProvider,
    currentModel,
    disabledSkills,
    useTaskSystem,
    disableCrewEnv,
  );

  const includeClaudeAgents = params.pluginConfig.claude_code?.agents ?? true;
  const userAgents = includeClaudeAgents ? loadUserAgents() : {};
  const projectAgents = includeClaudeAgents ? loadProjectAgents(params.ctx.directory) : {};

  const rawPluginAgents = params.pluginComponents.agents;
  const pluginAgents = Object.fromEntries(
    Object.entries(rawPluginAgents).map(([key, value]) => [
      key,
      value ? migrateAgentConfig(value as Record<string, unknown>) : value,
    ]),
  );

  const disabledAgentNames = new Set(
    (migratedDisabledAgents ?? []).map(a => a.toLowerCase())
  );

  const filterDisabledAgents = (agents: Record<string, unknown>) =>
    Object.fromEntries(
      Object.entries(agents).filter(([name]) => !disabledAgentNames.has(name.toLowerCase()))
    );

  const isCaptainEnabled = params.pluginConfig.captain_agent?.disabled !== true;
  const builderEnabled =
    params.pluginConfig.captain_agent?.default_builder_enabled ?? false;
  const plannerEnabled = params.pluginConfig.captain_agent?.planner_enabled ?? true;
  const replacePlan = params.pluginConfig.captain_agent?.replace_plan ?? true;
  const shouldDemotePlan = plannerEnabled && replacePlan;
  const configuredDefaultAgent = getConfiguredDefaultAgent(params.config);

  const configAgent = params.config.agent as AgentConfigRecord | undefined;

  if (isCaptainEnabled && builtinAgents.captain) {
    if (configuredDefaultAgent) {
      (params.config as { default_agent?: string }).default_agent =
        getAgentDisplayName(configuredDefaultAgent);
    } else {
      (params.config as { default_agent?: string }).default_agent =
        getAgentDisplayName("captain");
    }

    const agentConfig: Record<string, unknown> = {
      captain: builtinAgents.captain,
    };

    agentConfig["cadet"] = createCadetAgentWithOverrides(
      params.pluginConfig.agents?.["cadet"],
      undefined,
      useTaskSystem,
    );

    if (builderEnabled) {
      const { name: _buildName, ...buildConfigWithoutName } =
        configAgent?.build ?? {};
      const migratedBuildConfig = migrateAgentConfig(
        buildConfigWithoutName as Record<string, unknown>,
      );
      const override = params.pluginConfig.agents?.["OpenCode-Builder"];
      const base = {
        ...migratedBuildConfig,
        description: `${(configAgent?.build?.description as string) ?? "Build agent"} (OpenCode default)`,
      };
      agentConfig["OpenCode-Builder"] = override ? { ...base, ...override } : base;
    }

    if (plannerEnabled) {
      const strategistOverride = params.pluginConfig.agents?.["strategist"] as
        | (Record<string, unknown> & { prompt_append?: string })
        | undefined;

      agentConfig["strategist"] = await buildStrategistAgentConfig({
        configAgentPlan: configAgent?.plan,
        pluginStrategistOverride: strategistOverride,
        userCategories: params.pluginConfig.categories,
        currentModel,
      });
    }

    const filteredConfigAgents = configAgent
      ? Object.fromEntries(
          Object.entries(configAgent)
            .filter(([key]) => {
              if (key === "build") return false;
              if (key === "plan" && shouldDemotePlan) return false;
              if (key in builtinAgents) return false;
              return true;
            })
            .map(([key, value]) => [
              key,
              value ? migrateAgentConfig(value as Record<string, unknown>) : value,
            ]),
        )
      : {};

    const migratedBuild = configAgent?.build
      ? migrateAgentConfig(configAgent.build as Record<string, unknown>)
      : {};

    const planDemoteConfig = shouldDemotePlan
      ? buildPlanDemoteConfig(
          agentConfig["strategist"] as Record<string, unknown> | undefined,
          params.pluginConfig.agents?.plan as Record<string, unknown> | undefined,
        )
      : undefined;

    params.config.agent = {
      ...agentConfig,
      ...Object.fromEntries(
        Object.entries(builtinAgents).filter(([key]) => key !== "captain"),
      ),
      ...filterDisabledAgents(userAgents),
      ...filterDisabledAgents(projectAgents),
      ...filterDisabledAgents(pluginAgents),
      ...filteredConfigAgents,
      build: { ...migratedBuild, mode: "subagent", hidden: true },
      ...(planDemoteConfig ? { plan: planDemoteConfig } : {}),
    };
  } else {
    params.config.agent = {
      ...builtinAgents,
      ...filterDisabledAgents(userAgents),
      ...filterDisabledAgents(projectAgents),
      ...filterDisabledAgents(pluginAgents),
      ...configAgent,
    };
  }

  if (params.config.agent) {
    params.config.agent = remapAgentKeysToDisplayNames(
      params.config.agent as Record<string, unknown>,
    );
    params.config.agent = reorderAgentsByPriority(
      params.config.agent as Record<string, unknown>,
    );
  }

  const agentResult = params.config.agent as Record<string, unknown>;
  log("[config-handler] agents loaded", { agentKeys: Object.keys(agentResult) });
  return agentResult;
}
