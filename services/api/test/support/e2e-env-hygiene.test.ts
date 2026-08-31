import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// A guard against KNOWN_ISSUES K-41 coming back.
//
// The sweep that fixed it is worth nothing on its own: the trap returns the
// moment someone adds a new e2e suite that assigns `process.env` and walks
// away, and it returns INVISIBLY — the suite passes, and some other file fails
// later depending on run order. This is the cheapest thing that notices.
//
// Deliberately a static read of the source rather than a runtime check. A
// runtime check would have to observe the leak, which means reproducing the
// exact ordering that causes it; the property worth enforcing is simply "if you
// set it, you restore it".
// From the package root, not from import.meta — this file builds to CommonJS,
// where import.meta is unavailable. Vitest runs with services/api as its root,
// and the second test below fails loudly if this path stops finding suites.
const INTEGRATION_DIR = join(process.cwd(), "test", "integration");

// `process.env.NAME = ...` — assignment only. Reads are fine and everywhere.
const ASSIGNMENT = /process\.env\.([A-Z0-9_]+)\s*=[^=]/g;

interface Offender {
  file: string;
  keys: string[];
}

const offenders = (): Offender[] => {
  const found: Offender[] = [];
  // TEST FILES only. `use-a-separate-database.ts` is the globalSetup harness,
  // and redirecting DATABASE_URL for the whole run is precisely its job — it
  // has no "later suite" to leak into, because it IS the thing that runs first.
  for (const file of readdirSync(INTEGRATION_DIR).filter((f) => f.endsWith(".test.ts"))) {
    const source = readFileSync(join(INTEGRATION_DIR, file), "utf8");
    const keys = [...source.matchAll(ASSIGNMENT)].map((match) => match[1] ?? "");
    if (keys.length === 0) continue;

    // The rule is about the ASSIGNMENT, not about what the file mentions
    // elsewhere. An earlier version passed any file containing the word
    // "scopedEnv" — so a suite could call the helper once and still assign a
    // second variable directly, which is exactly the bug, and the guard said
    // nothing. Verified by putting that mutation back: it slipped through.
    //
    // Going through `scopedEnv` leaves NO bare assignment, so a compliant file
    // has an empty `keys` and never reaches here. A bare assignment is allowed
    // only when that same key is explicitly deleted — equivalent for a variable
    // that was absent, which is what predates the helper.
    const unrestored = [...new Set(keys)].filter(
      (key) => !new RegExp(`delete process\\.env\\.${key}\\b`).test(source),
    );
    if (unrestored.length > 0) found.push({ file, keys: unrestored });
  }
  return found;
};

describe("integration suites do not leak environment variables (K-41)", () => {
  it("every suite that sets process.env puts it back", () => {
    const leaking = offenders();

    expect(
      leaking.map((o) => `${o.file}: ${o.keys.join(", ")}`),
      "these suites assign process.env without restoring it. The integration " +
        "config runs files sequentially in ONE process, so whatever they leave " +
        "behind reaches every later suite. Use scopedEnv() from " +
        "test/support/scoped-env.ts, or delete the keys in afterAll.",
    ).toEqual([]);
  });

  it("actually reads the suites, rather than passing on an empty directory", () => {
    // Without this, a wrong path or a changed extension would make the check
    // above vacuously true — which is the failure mode of every guard that
    // looks at the filesystem.
    const files = readdirSync(INTEGRATION_DIR).filter((f) => f.endsWith(".e2e.test.ts"));
    expect(files.length).toBeGreaterThan(5);
  });
});
