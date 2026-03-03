/**
 * FTS5 search utilities tests.
 * TDD: RED-GREEN-REFACTOR cycle
 * Pattern: nested describe with #given/#when/#then prefixes
 */

import { describe, it, expect } from "bun:test"
import {
  buildFTS5Query,
  scoreFTS5Results,
  deduplicateByContent,
  type FTS5RawResult,
  type ScoredResult,
  type ScoreOptions,
} from "./fts5-utils"

describe("FTS5 Query Builder", () => {
  describe("#given multi-word query with stop words", () => {
    describe("#when buildFTS5Query called", () => {
      it("#then returns query with stop words stripped and terms joined with OR", () => {
        const result = buildFTS5Query("react hook usestate")
        expect(result).toBe("react OR hook OR usestate")
      })
    })
  })

  describe("#given query with quoted phrase", () => {
    describe("#when buildFTS5Query called", () => {
      it("#then preserves quoted phrase and filters surrounding stop words", () => {
        const result = buildFTS5Query('"error handling" in hooks')
        expect(result).toContain('"error handling"')
        expect(result).toContain("hooks")
        // 'in' is a stop word, so it should be filtered
        const terms = result.split(" OR ")
        expect(terms).not.toContain("in")
      })
    })
  })

  describe("#given query with only stop words", () => {
    describe("#when buildFTS5Query called", () => {
      it("#then returns empty string", () => {
        const result = buildFTS5Query("the a an is to for")
        expect(result).toBe("")
      })
    })
  })

  describe("#given single word query", () => {
    describe("#when buildFTS5Query called", () => {
      it("#then returns word unchanged", () => {
        const result = buildFTS5Query("single")
        expect(result).toBe("single")
      })
    })
  })

  describe("#given empty query", () => {
    describe("#when buildFTS5Query called", () => {
      it("#then returns empty string", () => {
        const result = buildFTS5Query("")
        expect(result).toBe("")
      })
    })
  })

  describe("#given query with FTS5 special characters", () => {
    describe("#when buildFTS5Query called with trailing question mark", () => {
      it("#then strips the question mark from the term", () => {
        const result = buildFTS5Query("How are tests structured in this project?")
        expect(result).not.toContain("?")
        expect(result).toContain("tests")
        expect(result).toContain("structured")
        expect(result).toContain("project")
      })
    })

    describe("#when buildFTS5Query called with asterisk and plus", () => {
      it("#then strips special characters from terms", () => {
        const result = buildFTS5Query("search* +required -excluded")
        expect(result).not.toContain("*")
        expect(result).not.toContain("+")
        expect(result).not.toContain("-")
        expect(result).toContain("search")
        expect(result).toContain("required")
        expect(result).toContain("excluded")
      })
    })

    describe("#when buildFTS5Query called with parentheses and caret", () => {
      it("#then strips special characters", () => {
        const result = buildFTS5Query("(group) ^boost term~")
        expect(result).not.toContain("(")
        expect(result).not.toContain(")")
        expect(result).not.toContain("^")
        expect(result).not.toContain("~")
        expect(result).toContain("group")
        expect(result).toContain("boost")
      })
    })

    describe("#when query becomes empty after stripping special chars", () => {
      it("#then returns empty string", () => {
        const result = buildFTS5Query("? * + -")
        expect(result).toBe("")
      })
    })

    describe("#when buildFTS5Query called with commas and periods", () => {
      it("#then strips commas and periods from terms", () => {
        const result = buildFTS5Query("hello, world. testing, comma, period.")
        expect(result).not.toContain(",")
        expect(result).not.toContain(".")
        expect(result).toContain("hello")
        expect(result).toContain("world")
        expect(result).toContain("testing")
        expect(result).toContain("comma")
        expect(result).toContain("period")
      })
    })
  })

  describe("#given query with XML-like tags", () => {
    describe("#when buildFTS5Query called with angle brackets", () => {
      it("#then strips angle brackets from terms", () => {
        const result = buildFTS5Query("<ultrawork-mode> session started")
        expect(result).not.toContain("<")
        expect(result).not.toContain(">")
        expect(result).toContain("ultraworkmode")
        expect(result).toContain("session")
        expect(result).toContain("started")
      })
    })
  })

  describe("#given quoted phrase with special characters", () => {
    describe("#when buildFTS5Query called with punctuation inside quotes", () => {
      it("#then sanitizes content inside quoted phrases", () => {
        const result = buildFTS5Query('"hello, world." testing')
        expect(result).not.toContain(",")
        expect(result).not.toContain(".")
        expect(result).toContain('"hello world"')
        expect(result).toContain("testing")
      })
    })

    describe("#when buildFTS5Query called with angle brackets inside quotes", () => {
      it("#then strips angle brackets from quoted phrase content", () => {
        const result = buildFTS5Query('"<system-reminder>" context')
        expect(result).not.toContain("<")
        expect(result).not.toContain(">")
        expect(result).toContain('"systemreminder"')
        expect(result).toContain("context")
      })
    })

    describe("#when quoted phrase becomes empty after sanitization", () => {
      it("#then drops the empty phrase entirely", () => {
        const result = buildFTS5Query('".,<>" real words')
        expect(result).toBe("real OR words")
      })
    })
  })

  describe("#given multiple quoted phrases", () => {
    describe("#when buildFTS5Query called", () => {
      it("#then preserves all quoted phrases and joins with OR", () => {
        const result = buildFTS5Query('"error handling" and "async operations"')
        expect(result).toContain('"error handling"')
        expect(result).toContain('"async operations"')
        expect(result).toContain("OR")
      })
    })
  })
})

describe("FTS5 Result Scoring", () => {
  describe("#given results with different recency", () => {
    describe("#when scoreFTS5Results called with same rank and utility", () => {
      it("#then recent result scores higher than old result", () => {
        const now = Date.now()
        const oneDay = 86400000
        const thirtyDays = oneDay * 30

        const results: FTS5RawResult[] = [
          {
            rank: -1.5,
            utility_score: 0.8,
            last_accessed_at: new Date(now - oneDay).toISOString(),
          },
          {
            rank: -1.5,
            utility_score: 0.8,
            last_accessed_at: new Date(now - thirtyDays).toISOString(),
          },
        ]

        const scored = scoreFTS5Results(results, "test", { halfLifeDays: 60 })

        expect(scored[0].score).toBeGreaterThan(scored[1].score)
      })
    })
  })

  describe("#given empty results array", () => {
    describe("#when scoreFTS5Results called", () => {
      it("#then returns empty array", () => {
        const scored = scoreFTS5Results([], "query")
        expect(scored).toEqual([])
      })
    })
  })

  describe("#given results with different base ranks", () => {
    describe("#when scoreFTS5Results called", () => {
      it("#then better rank (less negative) scores higher", () => {
        const results: FTS5RawResult[] = [
          {
            rank: -0.5, // better match
            utility_score: 0.5,
            last_accessed_at: new Date().toISOString(),
          },
          {
            rank: -2.0, // worse match
            utility_score: 0.5,
            last_accessed_at: new Date().toISOString(),
          },
        ]

        const scored = scoreFTS5Results(results, "test")

        expect(scored[0].score).toBeGreaterThan(scored[1].score)
      })
    })
  })

  describe("#given results with different utility scores", () => {
    describe("#when scoreFTS5Results called", () => {
      it("#then higher utility multiplier increases score", () => {
        const results: FTS5RawResult[] = [
          {
            rank: -1.0,
            utility_score: 0.9, // high utility
            last_accessed_at: new Date().toISOString(),
          },
          {
            rank: -1.0,
            utility_score: 0.1, // low utility
            last_accessed_at: new Date().toISOString(),
          },
        ]

        const scored = scoreFTS5Results(results, "test")

        expect(scored[0].score).toBeGreaterThan(scored[1].score)
      })
    })
  })

  describe("#given scored results", () => {
    describe("#when checking score range", () => {
      it("#then all scores are in 0.0-1.0 range", () => {
        const results: FTS5RawResult[] = [
          {
            rank: -1.5,
            utility_score: 0.8,
            last_accessed_at: new Date().toISOString(),
          },
          {
            rank: -0.5,
            utility_score: 0.5,
            last_accessed_at: new Date().toISOString(),
          },
          {
            rank: -3.0,
            utility_score: 0.2,
            last_accessed_at: new Date().toISOString(),
          },
        ]

        const scored = scoreFTS5Results(results, "test")

        scored.forEach((result) => {
          expect(result.score).toBeGreaterThanOrEqual(0.0)
          expect(result.score).toBeLessThanOrEqual(1.0)
        })
      })
    })
  })

  describe("#given scored results", () => {
    describe("#when checking order", () => {
      it("#then results sorted by score descending", () => {
        const results: FTS5RawResult[] = [
          {
            rank: -3.0,
            utility_score: 0.5,
            last_accessed_at: new Date().toISOString(),
          },
          {
            rank: -1.0,
            utility_score: 0.5,
            last_accessed_at: new Date().toISOString(),
          },
          {
            rank: -2.0,
            utility_score: 0.5,
            last_accessed_at: new Date().toISOString(),
          },
        ]

        const scored = scoreFTS5Results(results, "test")

        for (let i = 0; i < scored.length - 1; i++) {
          expect(scored[i].score).toBeGreaterThanOrEqual(scored[i + 1].score)
        }
      })
    })
  })
})

describe("Content Deduplication", () => {
  describe("#given results with duplicate content hashes", () => {
    describe("#when deduplicateByContent called", () => {
      it("#then keeps higher-scored result and removes duplicate", () => {
        const results: ScoredResult[] = [
          {
            rank: -1.5,
            utility_score: 0.8,
            last_accessed_at: new Date().toISOString(),
            content_hash: "hash-abc",
            score: 0.9,
          },
          {
            rank: -2.0,
            utility_score: 0.5,
            last_accessed_at: new Date().toISOString(),
            content_hash: "hash-abc",
            score: 0.6, // lower score, should be removed
          },
          {
            rank: -1.0,
            utility_score: 0.7,
            last_accessed_at: new Date().toISOString(),
            content_hash: "hash-def",
            score: 0.85,
          },
        ]

        const deduplicated = deduplicateByContent(results, 0.7)

        expect(deduplicated).toHaveLength(2)
        expect(deduplicated.map((r) => r.content_hash)).toEqual([
          "hash-abc",
          "hash-def",
        ])
      })
    })
  })

  describe("#given results with different content hashes", () => {
    describe("#when deduplicateByContent called", () => {
      it("#then preserves all results", () => {
        const results: ScoredResult[] = [
          {
            rank: -1.5,
            utility_score: 0.8,
            last_accessed_at: new Date().toISOString(),
            content_hash: "hash-abc",
            score: 0.9,
          },
          {
            rank: -1.2,
            utility_score: 0.7,
            last_accessed_at: new Date().toISOString(),
            content_hash: "hash-def",
            score: 0.85,
          },
        ]

        const deduplicated = deduplicateByContent(results, 0.7)

        expect(deduplicated).toHaveLength(2)
      })
    })
  })

  describe("#given empty results array", () => {
    describe("#when deduplicateByContent called", () => {
      it("#then returns empty array", () => {
        const deduplicated = deduplicateByContent([], 0.7)
        expect(deduplicated).toEqual([])
      })
    })
  })

  describe("#given results with no content_hash", () => {
    describe("#when deduplicateByContent called", () => {
      it("#then preserves all results (v1: exact hash match only)", () => {
        const results: ScoredResult[] = [
          {
            rank: -1.5,
            utility_score: 0.8,
            last_accessed_at: new Date().toISOString(),
            score: 0.9,
          },
          {
            rank: -1.2,
            utility_score: 0.7,
            last_accessed_at: new Date().toISOString(),
            score: 0.85,
          },
        ]

        const deduplicated = deduplicateByContent(results, 0.7)

        expect(deduplicated).toHaveLength(2)
      })
    })
  })
})
