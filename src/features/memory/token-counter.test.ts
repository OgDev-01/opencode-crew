import { describe, it, expect } from "bun:test";
import {
	estimateTokenCount,
	fitWithinTokenBudget,
	measurePromptTokens,
} from "./token-counter";

describe("#given estimateTokenCount", () => {
	describe("#when text is empty", () => {
		it("#then returns 0", () => {
			expect(estimateTokenCount("")).toBe(0);
		});
	});

	describe("#when text is 5 characters", () => {
		it("#then returns 2 (ceil(5/4))", () => {
			expect(estimateTokenCount("hello")).toBe(2);
		});
	});

	describe("#when text is 44 characters (sentence)", () => {
		it("#then returns 11 (44/4=11)", () => {
			expect(estimateTokenCount("The quick brown fox jumps over the lazy dog")).toBe(
				11
			);
		});
	});

	describe("#when text is 3 characters", () => {
		it("#then returns 1 (ceil(3/4))", () => {
			expect(estimateTokenCount("hey")).toBe(1);
		});
	});
});

describe("#given fitWithinTokenBudget", () => {
	describe("#when items array is empty", () => {
		it("#then returns empty array", () => {
			const result = fitWithinTokenBudget([], 100);
			expect(result).toEqual([]);
		});
	});

	describe("#when single oversized item exceeds budget", () => {
		it("#then returns empty array", () => {
			const items = [{ content: "a".repeat(400), priority: 1 }];
			const result = fitWithinTokenBudget(items, 10);
			expect(result).toHaveLength(0);
		});
	});

	describe("#when multiple items with different priorities", () => {
		it("#then selects by priority, highest first, respecting budget", () => {
			const items = [
				{ content: "short", priority: 2 }, // 2 tokens, priority 2
				{ content: "a".repeat(1000), priority: 3 }, // ~250 tokens, priority 3 (too large)
			];
			const result = fitWithinTokenBudget(items, 10);
			// High priority item (priority 3) is too large, skipped
			// Then low priority item (priority 2) fits
			expect(result).toHaveLength(1);
			expect(result[0].content).toBe("short");
		});
	});

	describe("#when all items fit within budget", () => {
		it("#then returns all items in priority order (highest first)", () => {
			const items = [
				{ content: "a", priority: 1 }, // 1 token
				{ content: "bb", priority: 2 }, // 1 token
				{ content: "ccc", priority: 3 }, // 1 token
			];
			const result = fitWithinTokenBudget(items, 10);
			// Should include all (total ~3 tokens), but ordered by priority descending
			expect(result).toHaveLength(3);
			expect(result[0].priority).toBe(3);
			expect(result[1].priority).toBe(2);
			expect(result[2].priority).toBe(1);
		});
	});

	describe("#when budget exactly fits some items", () => {
		it("#then includes items up to budget limit", () => {
			const items = [
				{ content: "x".repeat(4), priority: 1 }, // 1 token
				{ content: "y".repeat(4), priority: 2 }, // 1 token
				{ content: "z".repeat(4), priority: 3 }, // 1 token
			];
			const result = fitWithinTokenBudget(items, 2);
			// Highest priority items fill the budget
			expect(result).toHaveLength(2);
			expect(result[0].priority).toBe(3);
			expect(result[1].priority).toBe(2);
		});
	});
});

describe("#given measurePromptTokens", () => {
	describe("#when messages array is empty", () => {
		it("#then returns 0", () => {
			expect(measurePromptTokens([])).toBe(0);
		});
	});

	describe("#when single message", () => {
		it("#then estimates tokens for role + content + 4 overhead", () => {
			const messages = [{ role: "user", content: "hello" }];
			// role "user" = 1 token (4 chars / 4)
			// content "hello" = 2 tokens (5 chars / 4)
			// overhead = 4 tokens
			// total = 1 + 2 + 4 = 7
			expect(measurePromptTokens(messages)).toBe(7);
		});
	});

	describe("#when multiple messages", () => {
		it("#then sums tokens across all messages", () => {
			const messages = [
				{ role: "user", content: "hello" },
				{ role: "assistant", content: "world" },
			];
			// user message: ceil(4/4)=1 + ceil(5/4)=2 + 4 = 7
			// assistant message: ceil(9/4)=3 + ceil(5/4)=2 + 4 = 9
			// total = 16
			expect(measurePromptTokens(messages)).toBe(16);
		});
	});
});
