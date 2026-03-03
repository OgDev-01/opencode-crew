import type { IMemoryStorage } from "../types";

/**
 * Asymmetric score update: +0.01 on 'used', -0.02 on 'irrelevant'.
 * Clamped to [0, 1] range.
 */
export function updateUtilityScore(
  currentScore: number,
  outcome: "used" | "irrelevant"
): number {
  const delta = outcome === "used" ? 0.01 : -0.02;
  return Math.max(0, Math.min(1, currentScore + delta));
}

/**
 * Exponential temporal decay: score * Math.exp(-0.01 * daysSinceLastAccess).
 * Half-life ≈ 69.3 days (ln(2) / 0.01).
 */
export function applyTemporalDecay(
  score: number,
  daysSinceLastAccess: number
): number {
  return score * Math.exp(-0.01 * daysSinceLastAccess);
}

/**
 * Returns true if score decays below 0.1 threshold.
 */
export function isEvictionCandidate(
  score: number,
  daysSinceLastAccess: number
): boolean {
  return applyTemporalDecay(score, daysSinceLastAccess) < 0.1;
}

/**
 * Batch update: for each item, compute new score and call storage.updateLearning.
 * Assumes items start with utility_score = 0 (standard initialization).
 */
export async function batchUpdateScores(
  items: Array<{ memoryId: string; outcome: "used" | "irrelevant" }>,
  storage: IMemoryStorage
): Promise<void> {
  for (const item of items) {
    const newScore = updateUtilityScore(0, item.outcome);
    await storage.updateLearning(item.memoryId, { utility_score: newScore });
  }
}
