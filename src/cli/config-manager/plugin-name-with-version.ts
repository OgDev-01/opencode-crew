import { fetchNpmDistTags } from "./npm-dist-tags"
import type { ReleaseChannel } from "../types"

const PACKAGE_NAME = "@ogdev/opencode-crew"
const PRIORITIZED_TAGS = ["latest", "next", "alpha"] as const

function getFallbackEntry(version: string): string {
  const prereleaseMatch = version.match(/-([a-zA-Z][a-zA-Z0-9-]*)(?:\.|$)/)
  if (prereleaseMatch) {
    return `${PACKAGE_NAME}@${prereleaseMatch[1]}`
  }

  return PACKAGE_NAME
}

export async function getPluginNameWithVersion(currentVersion: string): Promise<string> {
  const distTags = await fetchNpmDistTags(PACKAGE_NAME)

  if (distTags) {
    const allTags = new Set([...PRIORITIZED_TAGS, ...Object.keys(distTags)])
    for (const tag of allTags) {
      if (distTags[tag] === currentVersion) {
        return `${PACKAGE_NAME}@${tag}`
      }
    }
  }

  return getFallbackEntry(currentVersion)
}

export function getPluginNameForChannel(channel: ReleaseChannel): string {
  if (channel === "next") return `${PACKAGE_NAME}@next`
  if (channel === "alpha") return `${PACKAGE_NAME}@alpha`
  return PACKAGE_NAME
}
