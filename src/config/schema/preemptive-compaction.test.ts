/// <reference types="bun-types" />

import { describe, it, expect } from "bun:test"

// Import will fail initially (RED), then pass when we create the schema
const { PreemptiveCompactionConfigSchema } = await import("./preemptive-compaction")

describe("preemptive-compaction config schema", () => {
  // #given preemptive compaction config schema
  // #when no value provided for threshold
  // #then default is 0.70
  it("should default threshold to 0.70 when not provided", () => {
    const result = PreemptiveCompactionConfigSchema.parse({})
    expect(result.threshold).toBe(0.7)
  })

  // #given preemptive compaction config schema
  // #when threshold is explicitly set to 0.80
  // #then 0.80 is used
  it("should accept explicitly set threshold of 0.80", () => {
    const result = PreemptiveCompactionConfigSchema.parse({ threshold: 0.8 })
    expect(result.threshold).toBe(0.8)
  })

  // #given preemptive compaction config schema
  // #when threshold is set to 0.70
  // #then 0.70 is accepted
  it("should accept default threshold value of 0.70 when explicitly set", () => {
    const result = PreemptiveCompactionConfigSchema.parse({ threshold: 0.7 })
    expect(result.threshold).toBe(0.7)
  })

  // #given preemptive compaction config schema
  // #when threshold is below 0.50
  // #then validation fails
  it("should reject threshold below 0.50", () => {
    const result = PreemptiveCompactionConfigSchema.safeParse({ threshold: 0.49 })
    expect(result.success).toBe(false)
  })

  // #given preemptive compaction config schema
  // #when threshold is above 0.95
  // #then validation fails
  it("should reject threshold above 0.95", () => {
    const result = PreemptiveCompactionConfigSchema.safeParse({ threshold: 0.96 })
    expect(result.success).toBe(false)
  })

  // #given preemptive compaction config schema
  // #when threshold is at lower bound 0.50
  // #then validation passes
  it("should accept threshold at lower bound of 0.50", () => {
    const result = PreemptiveCompactionConfigSchema.safeParse({ threshold: 0.5 })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.threshold).toBe(0.5)
    }
  })

  // #given preemptive compaction config schema
  // #when threshold is at upper bound 0.95
  // #then validation passes
  it("should accept threshold at upper bound of 0.95", () => {
    const result = PreemptiveCompactionConfigSchema.safeParse({ threshold: 0.95 })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.threshold).toBe(0.95)
    }
  })
})
