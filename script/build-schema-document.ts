import * as z from "zod"
import { OpenCodeCrewConfigSchema } from "../src/config/schema"

export function createOpenCodeCrewJsonSchema(): Record<string, unknown> {
  const jsonSchema = z.toJSONSchema(OpenCodeCrewConfigSchema, {
    target: "draft-7",
    unrepresentable: "any",
  })

  return {
    $schema: "http://json-schema.org/draft-07/schema#",
    $id: "https://raw.githubusercontent.com/OgDev-01/opencode-crew/dev/assets/opencode-crew.schema.json",
    title: "OpenCode Crew Configuration",
    description: "Configuration schema for opencode-crew plugin",
    ...jsonSchema,
  }
}
