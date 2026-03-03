import type { HookName } from "@/config"

import { safeCreateHook } from "@/shared/hook-utils/safe-create-hook"

export function hookSlot<T>(
  hookName: HookName,
  factory: () => T,
  isHookEnabled: (hookName: HookName) => boolean,
  safeHookEnabled: boolean,
): T | null {
  return isHookEnabled(hookName)
    ? safeCreateHook(hookName, factory, { enabled: safeHookEnabled })
    : null
}
