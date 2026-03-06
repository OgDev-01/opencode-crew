export function isLikelyMemoryDump(content: string): boolean {
  const normalized = content.toLowerCase()

  const hasAgentMemorySection = normalized.includes("## agent memory")
  const hasMetricsMarker = normalized.includes("totalmemories:") || normalized.includes("bytype:")
  const hasGoldenRulesHeading = normalized.includes("### golden rules")
  const hasLearningsHeading = normalized.includes("### learnings")
  const hasElfDumpPhrase = normalized.includes("here's what's stored in elf memory")

  return (
    (hasAgentMemorySection && hasMetricsMarker) ||
    (hasAgentMemorySection && (hasGoldenRulesHeading || hasLearningsHeading)) ||
    hasElfDumpPhrase
  )
}
