import { z } from "zod"

export const TokenMetricsConfigSchema = z.object({
  enabled: z.boolean().default(false),
})

export type TokenMetricsConfig = z.infer<typeof TokenMetricsConfigSchema>
