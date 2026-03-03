import { describe, it, expect, mock } from "bun:test";
import {
  updateUtilityScore,
  applyTemporalDecay,
  isEvictionCandidate,
  batchUpdateScores,
} from "./utility-scorer";
import type { IMemoryStorage } from "../types";

describe("#given updateUtilityScore", () => {
  describe("#when outcome is 'used'", () => {
    describe("#then increments score by 0.01 and clamps at 1", () => {
      it("adds 0.01 to score", () => {
        const result = updateUtilityScore(0.5, "used");
        expect(result).toBe(0.51);
      });

      it("clamps at 1 when result exceeds 1", () => {
        const result = updateUtilityScore(1.0, "used");
        expect(result).toBe(1);
      });

      it("handles low scores", () => {
        const result = updateUtilityScore(0.0, "used");
        expect(result).toBe(0.01);
      });
    });
  });

  describe("#when outcome is 'irrelevant'", () => {
    describe("#then decrements score by 0.02 and clamps at 0", () => {
      it("subtracts 0.02 from score", () => {
        const result = updateUtilityScore(0.5, "irrelevant");
        expect(result).toBe(0.48);
      });

      it("clamps at 0 when result goes negative", () => {
        const result = updateUtilityScore(0.0, "irrelevant");
        expect(result).toBe(0);
      });

      it("handles near-zero scores", () => {
        const result = updateUtilityScore(0.01, "irrelevant");
        expect(result).toBe(0);
      });

      it("handles high scores", () => {
        const result = updateUtilityScore(1.0, "irrelevant");
        expect(result).toBe(0.98);
      });
    });
  });
});

describe("#given applyTemporalDecay", () => {
  describe("#when calculating exponential decay", () => {
    describe("#then applies formula score * Math.exp(-0.01 * days)", () => {
      it("returns nearly identical score for 1 day", () => {
        const result = applyTemporalDecay(0.8, 1);
        const expected = 0.8 * Math.exp(-0.01);
        expect(Math.abs(result - expected) < 0.001).toBe(true);
        expect(result).toBeCloseTo(0.792, 2);
      });

      it("applies half-life decay at ~69 days", () => {
        const result = applyTemporalDecay(0.8, 69);
        const expected = 0.8 * Math.exp(-0.69);
        expect(Math.abs(result - expected) < 0.001).toBe(true);
        expect(result).toBeCloseTo(0.397, 2);
      });

      it("decays to very small values at 500 days", () => {
        const result = applyTemporalDecay(0.8, 500);
        expect(result < 0.01).toBe(true);
      });

      it("handles zero score", () => {
        const result = applyTemporalDecay(0, 100);
        expect(result).toBe(0);
      });
    });
  });
});

describe("#given isEvictionCandidate", () => {
  describe("#when checking if score falls below threshold after decay", () => {
    describe("#then returns true if applyTemporalDecay(score, days) < 0.1", () => {
      it("returns true for old, low-utility memories", () => {
        const result = isEvictionCandidate(0.2, 200);
        expect(result).toBe(true);
      });

      it("returns false for recent, high-utility memories", () => {
        const result = isEvictionCandidate(0.8, 1);
        expect(result).toBe(false);
      });

      it("returns false for at-threshold decayed score", () => {
        const result = isEvictionCandidate(0.5, 69);
        const decayed = applyTemporalDecay(0.5, 69);
        expect(decayed < 0.1).toBe(false);
        expect(result).toBe(false);
      });

      it("returns true for just-below-threshold decayed score", () => {
        const result = isEvictionCandidate(0.1, 230);
        const decayed = applyTemporalDecay(0.1, 230);
        expect(decayed < 0.1).toBe(true);
        expect(result).toBe(true);
      });
    });
  });
});

describe("#given batchUpdateScores", () => {
  describe("#when updating multiple items in storage", () => {
    describe("#then calls updateLearning for each item with new score", () => {
      it("updates single item", async () => {
        const mockStorage: IMemoryStorage = {
          updateLearning: mock(() => Promise.resolve()),
          addLearning: mock(() => Promise.resolve()),
          getLearning: mock(() => Promise.resolve(null)),
          deleteLearning: mock(() => Promise.resolve()),
          addGoldenRule: mock(() => Promise.resolve()),
          getGoldenRules: mock(() => Promise.resolve([])),
          getStats: mock(() => Promise.resolve({ learnings: 0, goldenRules: 0 })),
        };

        const items = [{ memoryId: "mem1", outcome: "used" as const }];
        await batchUpdateScores(items, mockStorage);

        expect(mockStorage.updateLearning).toHaveBeenCalledTimes(1);
        const call = (mockStorage.updateLearning as any).mock.calls[0];
        expect(call[0]).toBe("mem1");
        expect(call[1].utility_score).toBe(0.01);
      });

      it("updates multiple items", async () => {
        const mockStorage: IMemoryStorage = {
          updateLearning: mock(() => Promise.resolve()),
          addLearning: mock(() => Promise.resolve()),
          getLearning: mock(() => Promise.resolve(null)),
          deleteLearning: mock(() => Promise.resolve()),
          addGoldenRule: mock(() => Promise.resolve()),
          getGoldenRules: mock(() => Promise.resolve([])),
          getStats: mock(() => Promise.resolve({ learnings: 0, goldenRules: 0 })),
        };

        const items = [
          { memoryId: "mem1", outcome: "used" as const },
          { memoryId: "mem2", outcome: "irrelevant" as const },
        ];
        await batchUpdateScores(items, mockStorage);

        expect(mockStorage.updateLearning).toHaveBeenCalledTimes(2);
      });

      it("applies correct score updates for each outcome", async () => {
        const mockStorage: IMemoryStorage = {
          updateLearning: mock(() => Promise.resolve()),
          addLearning: mock(() => Promise.resolve()),
          getLearning: mock(() => Promise.resolve(null)),
          deleteLearning: mock(() => Promise.resolve()),
          addGoldenRule: mock(() => Promise.resolve()),
          getGoldenRules: mock(() => Promise.resolve([])),
          getStats: mock(() => Promise.resolve({ learnings: 0, goldenRules: 0 })),
        };

        const items = [
          { memoryId: "mem1", outcome: "used" as const },
          { memoryId: "mem2", outcome: "irrelevant" as const },
        ];
        await batchUpdateScores(items, mockStorage);

        const calls = (mockStorage.updateLearning as any).mock.calls;
        expect(calls[0][1].utility_score).toBe(0.01);
        expect(calls[1][1].utility_score).toBe(0);
      });

      it("handles empty items array", async () => {
        const mockStorage: IMemoryStorage = {
          updateLearning: mock(() => Promise.resolve()),
          addLearning: mock(() => Promise.resolve()),
          getLearning: mock(() => Promise.resolve(null)),
          deleteLearning: mock(() => Promise.resolve()),
          addGoldenRule: mock(() => Promise.resolve()),
          getGoldenRules: mock(() => Promise.resolve([])),
          getStats: mock(() => Promise.resolve({ learnings: 0, goldenRules: 0 })),
        };

        const items: Array<{ memoryId: string; outcome: "used" | "irrelevant" }> = [];
        await batchUpdateScores(items, mockStorage);

        expect(mockStorage.updateLearning).not.toHaveBeenCalled();
      });
    });
  });
});
