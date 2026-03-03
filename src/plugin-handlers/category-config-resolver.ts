import type { CategoryConfig } from "../config/schema";
import { DEFAULT_CATEGORIES } from "../shared/config/default-categories"

export function resolveCategoryConfig(
  categoryName: string,
  userCategories?: Record<string, CategoryConfig>,
): CategoryConfig | undefined {
  return userCategories?.[categoryName] ?? DEFAULT_CATEGORIES[categoryName];
}
