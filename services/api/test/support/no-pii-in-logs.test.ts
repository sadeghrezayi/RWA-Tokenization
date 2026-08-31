import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// "No test asserts that PII is absent from logs" was on the backlog's missing
// tests. The mail adapters got real behavioural tests; this is the other half —
// a guard that stops a NEW `log.*` call reintroducing what those tests removed.
//
// It exists because the fix that prompted it was a one-line regression waiting
// to happen: `SmtpEmailSender` logged the recipient's address on every send,
// justified in a comment as harmless. The application log is read by
// developers, shipped to aggregators, and pasted into CI build summaries. One
// careless template literal puts an address back.
//
// STATIC, on purpose. Catching this at runtime means provoking the exact call
// with the exact data; the property worth enforcing is simply "do not
// interpolate an identity or a credential into a log line".
const SRC = join(process.cwd(), "src");

// `this.log.warn(`...`)`, `logger.error(`...`)`, and friends — template
// literals only, since a plain string cannot carry a value.
const LOG_TEMPLATE = /\b(?:log|logger)\.(?:log|warn|error|debug|verbose|fatal)\(\s*`([^`]*)`/g;
const INTERPOLATION = /\$\{([^}]*)\}/g;

// Grounded in what this codebase actually logs (surveyed before writing the
// rule), not in a generic list. Each entry is a name whose VALUE identifies a
// person or authenticates as one.
const FORBIDDEN: { pattern: RegExp; why: string }[] = [
  { pattern: /^to$|recipient(?!Reference)/i, why: "a recipient address identifies a person" },
  { pattern: /email/i, why: "an email address identifies a person" },
  { pattern: /password/i, why: "a password, or its hash, is a credential" },
  // `tokenAddress`, `tokens`, `tokenId` and friends are chain values, not
  // secrets — only a bare `token` (or `resetToken`, `authToken`) is one.
  { pattern: /(^|[^a-zA-Z])token(?!s|Address|Id|Symbol|Name)/, why: "a token is a credential" },
  { pattern: /link/i, why: "a reset or verification link embeds a token" },
  { pattern: /phone|nationalId|ssn|iban|accountNumber/i, why: "a direct personal identifier" },
];

// The ONE place raw PII is written down, and only because it never sends: the
// log is the only way a developer gets the link. Pinned by its own tests
// alongside the label that makes it recognisable — see dev-email-sender.test.ts,
// whose existence is asserted below, because an exemption nobody tests is just
// a hole.
const ALLOWED = new Set(["dev-email-sender.ts"]);

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.isFile() && entry.name.endsWith(".ts") ? [path] : [];
  });

interface Finding {
  file: string;
  expression: string;
  why: string;
}

const findings = (): Finding[] => {
  const found: Finding[] = [];
  for (const path of sourceFiles(SRC)) {
    const name = path.slice(path.lastIndexOf("/") + 1);
    if (ALLOWED.has(name)) continue;
    const source = readFileSync(path, "utf8");
    for (const [, template] of source.matchAll(LOG_TEMPLATE)) {
      for (const [, expression] of (template ?? "").matchAll(INTERPOLATION)) {
        const value = (expression ?? "").trim();
        const rule = FORBIDDEN.find((candidate) => candidate.pattern.test(value));
        if (rule !== undefined) {
          found.push({ file: path.slice(SRC.length + 1), expression: value, why: rule.why });
        }
      }
    }
  }
  return found;
};

describe("no PII in application logs", () => {
  it("no log line interpolates an identity or a credential", () => {
    const leaks = findings().map((f) => `${f.file}: \${${f.expression}} — ${f.why}`);

    expect(
      leaks,
      "log the value through a non-identifying reference instead — see " +
        "recipientReference() in smtp-email-sender.ts. If a site is genuinely " +
        "the exception, add it to ALLOWED here and give it a test pinning what " +
        "it writes, as dev-email-sender.ts has.",
    ).toEqual([]);
  });

  it("actually reads the source tree, rather than passing on an empty scan", () => {
    // A guard that walks the filesystem fails OPEN when its path is wrong: it
    // finds nothing, reports nothing, and passes forever. The env-hygiene guard
    // needed the same assertion for the same reason.
    const files = sourceFiles(SRC);
    expect(files.length).toBeGreaterThan(100);
    expect(files.some((f) => f.endsWith("smtp-email-sender.ts"))).toBe(true);
  });

  it("keeps the one exemption honest by requiring its test", () => {
    // The dev sender is allowed to write an address and a token because it
    // never sends. That licence is only defensible while something asserts what
    // it writes AND that it is labelled — otherwise the exemption quietly
    // becomes an unexamined hole.
    const tests = readdirSync(join(process.cwd(), "test", "infrastructure"));
    expect(tests).toContain("dev-email-sender.test.ts");
  });
});
