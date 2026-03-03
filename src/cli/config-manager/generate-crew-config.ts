import type { InstallConfig } from "../types"
import { generateModelConfig } from "../model-fallback"

export function generateCrewConfig(installConfig: InstallConfig): Record<string, unknown> {
  return generateModelConfig(installConfig)
}
