import { describe, expect, it } from "bun:test"
import { DynamicContextPruningConfigSchema } from "./dynamic-context-pruning"

describe("DynamicContextPruningConfigSchema", () => {
  describe("#given dynamic-context-pruning config schema", () => {
    describe("#when no value provided for enabled", () => {
      it("should default to true", () => {
        const result = DynamicContextPruningConfigSchema.safeParse({})

        expect(result.success).toBe(true)
        if (!result.success) throw new Error("Parse failed")

        const data = result.data
        expect(data.enabled).toBe(true)
      })
    })

    describe("#when enabled is explicitly set to false", () => {
      it("should use false (regression test)", () => {
        const result = DynamicContextPruningConfigSchema.safeParse({
          enabled: false,
        })

        expect(result.success).toBe(true)
        if (!result.success) throw new Error("Parse failed")

        const data = result.data
        expect(data.enabled).toBe(false)
      })
    })

    describe("#when enabled is explicitly set to true", () => {
      it("should use true", () => {
        const result = DynamicContextPruningConfigSchema.safeParse({
          enabled: true,
        })

        expect(result.success).toBe(true)
        if (!result.success) throw new Error("Parse failed")

        const data = result.data
        expect(data.enabled).toBe(true)
      })
    })
  })
})
