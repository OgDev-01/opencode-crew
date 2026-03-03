import { z } from "zod"

export const GitMasterConfigSchema = z.object({
  /** Add "Ultraworked with Captain" footer to commit messages (default: true). Can be boolean or custom string. */
  commit_footer: z.union([z.boolean(), z.string()]).default(true),
  /** Add "Co-authored-by: Captain" trailer to commit messages (default: true) */
  include_co_authored_by: z.boolean().default(true),
})

export type GitMasterConfig = z.infer<typeof GitMasterConfigSchema>
