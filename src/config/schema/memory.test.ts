import { describe, expect, it } from "bun:test"
import { MemoryConfigSchema } from "./memory"

describe("MemoryConfigSchema", () => {
  describe("#given empty config object", () => {
    describe("#when parsing", () => {
      it("should apply all defaults", () => {
        const result = MemoryConfigSchema.safeParse({})

        expect(result.success).toBe(true)
        if (!result.success) throw new Error("Parse failed")

        const data = result.data
        expect(data.enabled).toBe(true)
        expect(data.similarity_threshold).toBe(0.7)
        expect(data.max_golden_rules_injected).toBe(5)
        expect(data.max_learnings_injected).toBe(10)
        expect(data.max_injection_tokens).toBe(500)
        expect(data.ttl_learnings_days).toBe(60)
        expect(data.golden_rule_confidence_threshold).toBe(0.9)
        expect(data.golden_rule_validation_count).toBe(10)
        expect(data.project_db_path).toBe(".opencode/elf/memory.db")
        expect(data.global_db_path).toBe("~/.opencode/elf/memory.db")
        expect(data.privacy_tags).toEqual(["private", "secret", "credential"])
        expect(data.dynamic_prompts_enabled).toBe(true)
        expect("embedding_model" in data).toBe(false)
        expect("ttl_golden_rules_days" in data).toBe(false)
        expect("ttl_heuristics_days" in data).toBe(false)
        expect("delegation_cost_awareness" in data).toBe(false)
      })
    })
  })

  describe("#given similarity_threshold of 2.0", () => {
    describe("#when parsing", () => {
      it("should reject with validation error (max 1.0)", () => {
        const result = MemoryConfigSchema.safeParse({
          similarity_threshold: 2.0,
        })

        expect(result.success).toBe(false)
        if (result.success) throw new Error("Should have failed")
        expect(result.error.issues.length).toBeGreaterThan(0)
      })
    })
  })

  describe("#given similarity_threshold of -0.5", () => {
    describe("#when parsing", () => {
      it("should reject with validation error (min 0.0)", () => {
        const result = MemoryConfigSchema.safeParse({
          similarity_threshold: -0.5,
        })

        expect(result.success).toBe(false)
        if (result.success) throw new Error("Should have failed")
        expect(result.error.issues.length).toBeGreaterThan(0)
      })
    })
  })

  describe("#given golden_rule_confidence_threshold of 1.5", () => {
    describe("#when parsing", () => {
      it("should reject with validation error (max 1.0)", () => {
        const result = MemoryConfigSchema.safeParse({
          golden_rule_confidence_threshold: 1.5,
        })

        expect(result.success).toBe(false)
        if (result.success) throw new Error("Should have failed")
        expect(result.error.issues.length).toBeGreaterThan(0)
      })
    })
  })

  describe("#given valid partial config", () => {
    describe("#when parsing", () => {
      it("should merge with defaults and accept", () => {
        const result = MemoryConfigSchema.safeParse({
          enabled: false,
          similarity_threshold: 0.5,
          max_golden_rules_injected: 3,
        })

        expect(result.success).toBe(true)
        if (!result.success) throw new Error("Parse failed")

        const data = result.data
        expect(data.enabled).toBe(false)
        expect(data.similarity_threshold).toBe(0.5)
        expect(data.max_golden_rules_injected).toBe(3)
        // Verify other defaults still applied
        expect(data.ttl_learnings_days).toBe(60)
      })
    })
  })

  describe("#given valid string array for privacy_tags", () => {
    describe("#when parsing", () => {
      it("should accept custom privacy tags", () => {
        const result = MemoryConfigSchema.safeParse({
          privacy_tags: ["custom", "internal"],
        })

        expect(result.success).toBe(true)
        if (!result.success) throw new Error("Parse failed")

        expect(result.data.privacy_tags).toEqual(["custom", "internal"])
      })
    })
  })
})
