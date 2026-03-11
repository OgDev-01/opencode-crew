import type { ToolDefinition } from "@opencode-ai/plugin"

import type {
  AvailableCategory,
} from "../shared/agent"
import type { OpenCodeCrewConfig } from "../config"
import type { PluginContext, ToolsRecord } from "./types"

import {
  builtinTools,
  createBackgroundTools,
  createCallAgent,
  createLookAt,
  createSkillMcpTool,
  createSkillTool,
  createGrepTools,
  createGlobTools,
  createAstGrepTools,
  createSessionManagerTools,
  createDelegateTask,
  discoverCommandsSync,
  interactive_bash,
  createTaskCreateTool,
  createTaskGetTool,
  createTaskList,
  createTaskUpdateTool,
  createHashlineEditTool,
  createElfTool,
} from "../tools"
import { getMainSessionID } from "../features/claude-code-session-state"
import { filterDisabledTools } from "../shared/config/disabled-tools"
import { log } from "../shared"
import { getConfiguredDb } from "../features/memory/db/client"
import { createMemoryStorage } from "../features/memory/storage/memory-storage"
import { createSearchService } from "../features/memory/search/search-service"
import { filterContent } from "../features/memory/privacy-filter"
import { computeContextHash, findExistingByHash } from "../features/memory/dedup/context-hash"

import type { Managers } from "../create-managers"
import type { SkillContext } from "./skill-context"

export type ToolRegistryResult = {
  filteredTools: ToolsRecord
  taskSystemEnabled: boolean
}

export function createToolRegistry(args: {
  ctx: PluginContext
  pluginConfig: OpenCodeCrewConfig
  managers: Pick<Managers, "backgroundManager" | "tmuxSessionManager" | "skillMcpManager">
  skillContext: SkillContext
  availableCategories: AvailableCategory[]
}): ToolRegistryResult {
  const { ctx, pluginConfig, managers, skillContext, availableCategories } = args

  const backgroundTools = createBackgroundTools(managers.backgroundManager, ctx.client)
  const callAgent = createCallAgent(ctx, managers.backgroundManager, pluginConfig.disabled_agents ?? [])

  const isMultimodalLookerEnabled = !(pluginConfig.disabled_agents ?? []).some(
    (agent) => agent.toLowerCase() === "spotter",
  )
  const lookAt = isMultimodalLookerEnabled ? createLookAt(ctx) : null

  const delegateTask = createDelegateTask({
    manager: managers.backgroundManager,
    client: ctx.client,
    directory: ctx.directory,
    userCategories: pluginConfig.categories,
    agentOverrides: pluginConfig.agents,
    gitMasterConfig: pluginConfig.git_master,
    cadetModel: pluginConfig.agents?.["cadet"]?.model,
    browserProvider: skillContext.browserProvider,
    disabledSkills: skillContext.disabledSkills,
    availableCategories,
    availableSkills: skillContext.availableSkills,
    onSyncSessionCreated: async (event) => {
      log("[index] onSyncSessionCreated callback", {
        sessionID: event.sessionID,
        parentID: event.parentID,
        title: event.title,
      })
      await managers.tmuxSessionManager.onSessionCreated({
        type: "session.created",
        properties: {
          info: {
            id: event.sessionID,
            parentID: event.parentID,
            title: event.title,
          },
        },
      })
    },
  })

  const getSessionIDForMcp = (): string => getMainSessionID() || ""

  const skillMcpTool = createSkillMcpTool({
    manager: managers.skillMcpManager,
    getLoadedSkills: () => skillContext.mergedSkills,
    getSessionID: getSessionIDForMcp,
  })

  const commands = discoverCommandsSync(ctx.directory)
  const skillTool = createSkillTool({
    commands,
    skills: skillContext.mergedSkills,
    mcpManager: managers.skillMcpManager,
    getSessionID: getSessionIDForMcp,
    gitMasterConfig: pluginConfig.git_master,
  })

  const taskSystemEnabled = pluginConfig.experimental?.task_system ?? false
  const taskToolsRecord: Record<string, ToolDefinition> = taskSystemEnabled
    ? {
        task_create: createTaskCreateTool(pluginConfig, ctx),
        task_get: createTaskGetTool(pluginConfig),
        task_list: createTaskList(pluginConfig),
        task_update: createTaskUpdateTool(pluginConfig, ctx),
      }
    : {}

  const hashlineEnabled = pluginConfig.hashline_edit ?? true
  const hashlineToolsRecord: Record<string, ToolDefinition> = hashlineEnabled
    ? { edit: createHashlineEditTool() }
    : {}

  const memoryEnabled = pluginConfig.memory?.enabled ?? true
  const elfToolsRecord: Record<string, ToolDefinition> = memoryEnabled
    ? (() => {
      const db = getConfiguredDb(
        ctx.directory,
        pluginConfig.memory?.scope ?? "project",
        pluginConfig.memory?.project_db_path,
        pluginConfig.memory?.global_db_path
      )
      const storage = createMemoryStorage(db)
      const search = createSearchService(db)
      return { elf: createElfTool({ storage, search, db, filterContent, computeContextHash, findExistingByHash }) }
    })()
    : {}

  const allTools: Record<string, ToolDefinition> = {
    ...builtinTools,
    ...createGrepTools(ctx),
    ...createGlobTools(ctx),
    ...createAstGrepTools(ctx),
    ...createSessionManagerTools(ctx),
    ...backgroundTools,
    call_agent: callAgent,
    ...(lookAt ? { look_at: lookAt } : {}),
    task: delegateTask,
    skill_mcp: skillMcpTool,
    skill: skillTool,
    interactive_bash,
    ...taskToolsRecord,
    ...hashlineToolsRecord,
    ...elfToolsRecord,
  }

  const filteredTools = filterDisabledTools(allTools, pluginConfig.disabled_tools)

  return {
    filteredTools,
    taskSystemEnabled,
  }
}
