import { z } from "zod"

export const MemoryConfigSchema = z.object({
  enabled: z.boolean().default(true),
  scope: z.enum(["project", "global"]).default("project"),
  embedding_model: z.string().default("Xenova/all-MiniLM-L6-v2"),
  similarity_threshold: z.number().min(0.0).max(1.0).default(0.7),
  max_golden_rules_injected: z.number().default(5),
  max_learnings_injected: z.number().default(10),
  max_injection_tokens: z.number().default(500),
  ttl_learnings_days: z.number().default(60),
  ttl_golden_rules_days: z.number().default(90),
  ttl_heuristics_days: z.number().default(180),
  golden_rule_confidence_threshold: z.number().min(0.0).max(1.0).default(0.9),
  golden_rule_validation_count: z.number().default(10),
  project_db_path: z.string().default(".opencode/elf/memory.db"),
  global_db_path: z.string().default("~/.opencode/elf/memory.db"),
  privacy_tags: z.array(z.string()).default(["private", "secret", "credential"]),
  dynamic_prompts_enabled: z.boolean().default(true),
  delegation_cost_awareness: z.boolean().default(true),
})

export type MemoryConfig = z.infer<typeof MemoryConfigSchema>
