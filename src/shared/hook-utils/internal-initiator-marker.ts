export const CREW_INTERNAL_INITIATOR_MARKER = "<!-- CREW_INTERNAL_INITIATOR -->"

export function createInternalAgentTextPart(text: string): {
  type: "text"
  text: string
} {
  return {
    type: "text",
    text: `${text}\n${CREW_INTERNAL_INITIATOR_MARKER}`,
  }
}
