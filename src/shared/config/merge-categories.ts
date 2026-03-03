import type { CategoriesConfig, CategoryConfig } from "@/config/schema"
import { DEFAULT_CATEGORIES } from "./default-categories"

/**
 * Merge default and user categories, filtering out disabled ones.
 * Single source of truth for category merging across the codebase.
 */
export function mergeCategories(
  userCategories?: CategoriesConfig,
): Record<string, CategoryConfig> {
  const merged = userCategories
    ? { ...DEFAULT_CATEGORIES, ...userCategories }
    : { ...DEFAULT_CATEGORIES }

  return Object.fromEntries(
    Object.entries(merged).filter(([, config]) => !config.disable),
  )
}
