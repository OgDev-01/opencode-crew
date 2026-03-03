import { describe, test, expect } from "bun:test"
import { createSageAgent } from "./sage"
import { createArchivistAgent } from "./archivist"
import { createLookoutAgent } from "./lookout"
import { createCriticAgent } from "./critic"
import { createAssessorAgent } from "./assessor"
import { createRelayAgent } from "./relay"

const TEST_MODEL = "anthropic/claude-sonnet-4-5"

describe("read-only agent tool restrictions", () => {
  const FILE_WRITE_TOOLS = ["write", "edit", "apply_patch"]

  describe("Sage", () => {
    test("denies all file-writing tools", () => {
      // given
      const agent = createSageAgent(TEST_MODEL)

      // when
      const permission = agent.permission as Record<string, string>

      // then
      for (const tool of FILE_WRITE_TOOLS) {
        expect(permission[tool]).toBe("deny")
      }
    })

    test("denies task but allows call_agent for research", () => {
      // given
      const agent = createSageAgent(TEST_MODEL)

      // when
      const permission = agent.permission as Record<string, string>

      // then
      expect(permission["task"]).toBe("deny")
      expect(permission["call_agent"]).toBeUndefined()
    })
  })

  describe("Archivist", () => {
    test("denies all file-writing tools", () => {
      // given
      const agent = createArchivistAgent(TEST_MODEL)

      // when
      const permission = agent.permission as Record<string, string>

      // then
      for (const tool of FILE_WRITE_TOOLS) {
        expect(permission[tool]).toBe("deny")
      }
    })
  })

  describe("Lookout", () => {
    test("denies all file-writing tools", () => {
      // given
      const agent = createLookoutAgent(TEST_MODEL)

      // when
      const permission = agent.permission as Record<string, string>

      // then
      for (const tool of FILE_WRITE_TOOLS) {
        expect(permission[tool]).toBe("deny")
      }
    })
  })

  describe("Critic", () => {
    test("denies all file-writing tools", () => {
      // given
      const agent = createCriticAgent(TEST_MODEL)

      // when
      const permission = agent.permission as Record<string, string>

      // then
      for (const tool of FILE_WRITE_TOOLS) {
        expect(permission[tool]).toBe("deny")
      }
    })
  })

  describe("Assessor", () => {
    test("denies all file-writing tools", () => {
      // given
      const agent = createAssessorAgent(TEST_MODEL)

      // when
      const permission = agent.permission as Record<string, string>

      // then
      for (const tool of FILE_WRITE_TOOLS) {
        expect(permission[tool]).toBe("deny")
      }
    })
  })

  describe("Relay", () => {
    test("allows delegation tools for orchestration", () => {
      // given
      const agent = createRelayAgent({ model: TEST_MODEL })

      // when
      const permission = (agent.permission ?? {}) as Record<string, string>

      // then
      expect(permission["task"]).toBeUndefined()
      expect(permission["call_agent"]).toBeUndefined()
    })
  })
})
