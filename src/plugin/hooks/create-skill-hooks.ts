import type { AvailableSkill } from "@/shared/agent"
import type { HookName } from "@/config"
import type { LoadedSkill } from "@/features/opencode-skill-loader/types"
import type { PluginContext } from "../types"

import { createAutoSlashCommandHook, createCategorySkillReminderHook } from "@/hooks"
import { hookSlot } from "./hook-slot"

export type SkillHooks = {
  categorySkillReminder: ReturnType<typeof createCategorySkillReminderHook> | null
  autoSlashCommand: ReturnType<typeof createAutoSlashCommandHook> | null
}

export function createSkillHooks(args: {
  ctx: PluginContext
  isHookEnabled: (hookName: HookName) => boolean
  safeHookEnabled: boolean
  mergedSkills: LoadedSkill[]
  availableSkills: AvailableSkill[]
}): SkillHooks {
  const { ctx, isHookEnabled, safeHookEnabled, mergedSkills, availableSkills } = args

  const categorySkillReminder = hookSlot(
    "category-skill-reminder",
    () => createCategorySkillReminderHook(ctx, availableSkills),
    isHookEnabled,
    safeHookEnabled,
  )

  const autoSlashCommand = hookSlot(
    "auto-slash-command",
    () => createAutoSlashCommandHook({ skills: mergedSkills }),
    isHookEnabled,
    safeHookEnabled,
  )

  return { categorySkillReminder, autoSlashCommand }
}
