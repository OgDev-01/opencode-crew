import type { OpenCodeCrewConfig } from "../config";
import { getAgentDisplayName } from "../shared/agent/agent-display-names";
import { setAgentToolOverrides, clearAgentToolOverrides } from "../shared/agent/agent-tool-restrictions";
import type { AgentOverrides } from "../config/schema/agent-overrides";

type AgentWithPermission = { permission?: Record<string, unknown> };

function agentByKey(agentResult: Record<string, unknown>, key: string): AgentWithPermission | undefined {
  return (agentResult[key] ?? agentResult[getAgentDisplayName(key)]) as
    | AgentWithPermission
    | undefined;
}


function applyAgentToolOverridesFromConfig(agents: AgentOverrides | undefined): void {
  clearAgentToolOverrides()
  if (!agents) return
  for (const [agentName, override] of Object.entries(agents)) {
    if (override?.tools && Object.keys(override.tools).length > 0) {
      setAgentToolOverrides(agentName, override.tools)
    }
  }
}

export function applyToolConfig(params: {
  config: Record<string, unknown>;
  pluginConfig: OpenCodeCrewConfig;
  agentResult: Record<string, unknown>;
}): void {
  applyAgentToolOverridesFromConfig(params.pluginConfig.agents)

  const denyTodoTools = params.pluginConfig.experimental?.task_system
    ? { todowrite: "deny", todoread: "deny" }
    : {}

  params.config.tools = {
    ...(params.config.tools as Record<string, unknown>),
    "grep_app_*": false,
    LspHover: false,
    LspCodeActions: false,
    LspCodeActionResolve: false,
    "task_*": false,
    teammate: false,
    ...(params.pluginConfig.experimental?.task_system
      ? { todowrite: false, todoread: false }
      : {}),
  };

  const isCliRunMode = process.env.OPENCODE_CLI_RUN_MODE === "true";
  const questionPermission = isCliRunMode ? "deny" : "allow";

  const archivist = agentByKey(params.agentResult, "archivist");
  if (archivist) {
    archivist.permission = { ...archivist.permission, "grep_app_*": "allow" };
  }
  const looker = agentByKey(params.agentResult, "spotter");
  if (looker) {
    looker.permission = { ...looker.permission, task: "deny", look_at: "deny" };
  }
  const relay = agentByKey(params.agentResult, "relay");
  if (relay) {
    relay.permission = {
      ...relay.permission,
      task: "allow",
      call_agent: "deny",
      "task_*": "allow",
      teammate: "allow",
      ...denyTodoTools,
    };
  }
  const captain = agentByKey(params.agentResult, "captain");
  if (captain) {
    captain.permission = {
      ...captain.permission,
      call_agent: "deny",
      task: "allow",
      question: questionPermission,
      "task_*": "allow",
      teammate: "allow",
      ...denyTodoTools,
    };
  }
  const craftsman = agentByKey(params.agentResult, "craftsman");
  if (craftsman) {
    craftsman.permission = {
      ...craftsman.permission,
      call_agent: "deny",
      task: "allow",
      question: questionPermission,
      ...denyTodoTools,
    };
  }
  const strategist = agentByKey(params.agentResult, "strategist");
  if (strategist) {
    strategist.permission = {
      ...strategist.permission,
      call_agent: "deny",
      task: "allow",
      question: questionPermission,
      "task_*": "allow",
      teammate: "allow",
      ...denyTodoTools,
    };
  }
  const junior = agentByKey(params.agentResult, "cadet");
  if (junior) {
    junior.permission = {
      ...junior.permission,
      task: "allow",
      "task_*": "allow",
      teammate: "allow",
      ...denyTodoTools,
    };
  }

  params.config.permission = {
    ...(params.config.permission as Record<string, unknown>),
    webfetch: "allow",
    external_directory: "allow",
    task: "deny",
  };
}
