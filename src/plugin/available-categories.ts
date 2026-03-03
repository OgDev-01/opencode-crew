import type { AvailableCategory } from "../shared/agent"
import type { OpenCodeCrewConfig } from "../config"
import { CATEGORY_DESCRIPTIONS } from "../shared/agent"
import { mergeCategories } from "../shared/config/merge-categories"

export function createAvailableCategories(
  pluginConfig: OpenCodeCrewConfig,
): AvailableCategory[] {
  const categories = mergeCategories(pluginConfig.categories)

  return Object.entries(categories).map(([name, categoryConfig]) => {
    const model =
      typeof categoryConfig.model === "string" ? categoryConfig.model : undefined

    return {
      name,
      description:
        pluginConfig.categories?.[name]?.description ??
        CATEGORY_DESCRIPTIONS[name] ??
        "General tasks",
      model,
    }
  })
}
