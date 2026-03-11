import { describe, it, expect } from "bun:test";
import {
  extractFilePaths,
  filterContent,
  shouldSkipTool,
  shouldSkipFile,
} from "./privacy-filter";

describe("#given filterContent", () => {
  describe("#when stripping private tags", () => {
    it("#then removes <private> tags and replaces with [REDACTED]", () => {
      const input = "hello <private>secret</private> world";
      const result = filterContent(input, ["private"]);
      expect(result).toBe("hello [REDACTED] world");
    });

    it("#then removes multiline private tags", () => {
      const input = "start\n<private>\nmultiline\nsecret\n</private>\nend";
      const result = filterContent(input, ["private"]);
      expect(result).toContain("start");
      expect(result).toContain("end");
      expect(result).not.toContain("multiline");
      expect(result).not.toContain("secret");
    });

    it("#then handles custom tag names", () => {
      const input = "data <secret>credentials</secret> here";
      const result = filterContent(input, ["secret"]);
      expect(result).toBe("data [REDACTED] here");
    });

    it("#then handles multiple custom tags", () => {
      const input =
        "a <private>x</private> b <secret>y</secret> c <token>z</token>";
      const result = filterContent(input, ["private", "secret", "token"]);
      expect(result).toBe("a [REDACTED] b [REDACTED] c [REDACTED]");
    });

    it("#then returns unchanged when no tags present", () => {
      const input = "clean text without secrets";
      const result = filterContent(input, ["private"]);
      expect(result).toBe("clean text without secrets");
    });
  });

  describe("#when redacting API key patterns", () => {
    it("#then redacts Stripe/OpenAI keys (sk-*)", () => {
      const input = "key is sk-proj-abc123xyzabc123xyz";
      const result = filterContent(input, []);
      expect(result).toContain("[REDACTED]");
      expect(result).not.toContain("sk-proj");
      expect(result).not.toContain("abc123");
    });

    it("#then redacts AWS keys (AKIA*)", () => {
      const input = "token AKIA1234567890ABCDEF rest";
      const result = filterContent(input, []);
      expect(result).toContain("[REDACTED]");
      expect(result).not.toContain("AKIA1234567890ABCDEF");
    });

    it("#then redacts GitHub tokens (ghp_*)", () => {
      const input = "github token ghp_1234567890abcdefghijklmnopqrstuvwxyz end";
      const result = filterContent(input, []);
      expect(result).toContain("[REDACTED]");
      expect(result).not.toContain("ghp_");
    });

    it("#then redacts Bearer tokens", () => {
      const input = "auth: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9";
      const result = filterContent(input, []);
      expect(result).toContain("Bearer");
      expect(result).toContain("[REDACTED]");
      expect(result).not.toContain("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9");
    });

    it("#then handles multiple keys in same content", () => {
      const input =
        "key1 sk-proj-20charslongkey123 and key2 AKIA1234567890ABCDEF and ghp_1234567890abcdefghijklmnopqrstuvwxyz";
      const result = filterContent(input, []);
      const redactedCount = (result.match(/\[REDACTED\]/g) || []).length;
      expect(redactedCount).toBe(3);
      expect(result).not.toContain("sk-");
      expect(result).not.toContain("AKIA");
      expect(result).not.toContain("ghp_");
    });

    it("#then combines privacy tags with API key redaction", () => {
      const input =
        "secret <private>db_password</private> and key sk-proj-abcdefghijk12345";
      const result = filterContent(input, ["private"]);
      const redactedCount = (result.match(/\[REDACTED\]/g) || []).length;
      expect(redactedCount).toBe(2);
    });
  });

  describe("#when handling edge cases", () => {
    it("#then handles empty input", () => {
      const result = filterContent("", ["private"]);
      expect(result).toBe("");
    });

    it("#then handles empty tag list", () => {
      const input = "some text without tags";
      const result = filterContent(input, []);
      expect(result).toBe("some text without tags");
    });

    it("#then handles nested-like tag names", () => {
      const input = "data <priv>secret</priv> end";
      const result = filterContent(input, ["priv"]);
      expect(result).toBe("data [REDACTED] end");
    });
  });
});

describe("#given shouldSkipTool", () => {
  describe("#when checking tool names", () => {
    it("#then returns false for all tools in v1", () => {
      expect(shouldSkipTool("read_file")).toBe(false);
      expect(shouldSkipTool("bash")).toBe(false);
      expect(shouldSkipTool("write_file")).toBe(false);
      expect(shouldSkipTool("any_tool")).toBe(false);
    });
  });
});

describe("#given shouldSkipFile", () => {
  describe("#when checking file paths", () => {
    it("#then skips .env files", () => {
      expect(shouldSkipFile(".env")).toBe(true);
    });

    it("#then skips .env.local and .env.* variants", () => {
      expect(shouldSkipFile(".env.local")).toBe(true);
      expect(shouldSkipFile(".env.production")).toBe(true);
      expect(shouldSkipFile(".env.staging")).toBe(true);
    });

    it("#then skips credentials.json", () => {
      expect(shouldSkipFile("credentials.json")).toBe(true);
    });

    it("#then skips .pem files", () => {
      expect(shouldSkipFile("server.pem")).toBe(true);
      expect(shouldSkipFile("private_key.pem")).toBe(true);
    });

    it("#then skips .key files", () => {
      expect(shouldSkipFile("server.key")).toBe(true);
      expect(shouldSkipFile("id_rsa.key")).toBe(true);
    });

    it("#then skips paths containing /.ssh/", () => {
      expect(shouldSkipFile("/home/user/.ssh/id_rsa")).toBe(true);
      expect(shouldSkipFile("~/.ssh/config")).toBe(true);
      expect(shouldSkipFile("src/.ssh/private")).toBe(true);
    });

    it("#then skips secrets.yaml and secrets.yml", () => {
      expect(shouldSkipFile("secrets.yaml")).toBe(true);
      expect(shouldSkipFile("secrets.yml")).toBe(true);
    });

    it("#then does not skip regular source files", () => {
      expect(shouldSkipFile("src/app.ts")).toBe(false);
      expect(shouldSkipFile("package.json")).toBe(false);
      expect(shouldSkipFile("README.md")).toBe(false);
    });

    it("#then does not skip .env in the middle of filename", () => {
      expect(shouldSkipFile("server.env.example")).toBe(false);
    });

    it("#then is case-insensitive for extensions", () => {
      expect(shouldSkipFile("FILE.PEM")).toBe(true);
      expect(shouldSkipFile("FILE.KEY")).toBe(true);
    });

    it("#then handles full paths with sensitive files", () => {
      expect(shouldSkipFile("/config/prod/.env.production")).toBe(true);
      expect(shouldSkipFile("C:\\project\\credentials.json")).toBe(true);
    });
  });
});

describe("#given extractFilePaths", () => {
  describe("#when metadata contains common path fields", () => {
    it("#then returns top-level file path values", () => {
      const paths = extractFilePaths({
        filePath: "/tmp/.env",
        filepath: "/tmp/credentials.json",
      });

      expect(paths.sort()).toEqual(["/tmp/.env", "/tmp/credentials.json"].sort());
    });

    it("#then returns nested filediff path values", () => {
      const paths = extractFilePaths({
        filediff: {
          file: "/tmp/private.pem",
          path: "/tmp/.ssh/id_rsa",
        },
      });

      expect(paths.sort()).toEqual(["/tmp/private.pem", "/tmp/.ssh/id_rsa"].sort());
    });
  });
});
