import { z } from "zod"

export const PreemptiveCompactionConfigSchema = z.object({
  /** Threshold for triggering preemptive compaction (0.50-0.95, default: 0.70) */
  threshold: z.number().min(0.5).max(0.95).default(0.7),
})

export type PreemptiveCompactionConfig = z.infer<
  typeof PreemptiveCompactionConfigSchema
>
