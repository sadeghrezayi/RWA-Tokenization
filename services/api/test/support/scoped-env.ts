// Set an environment variable for ONE suite and put it back afterwards
// (KNOWN_ISSUES K-41).
//
// The integration config runs files sequentially in a SINGLE PROCESS
// (`fileParallelism: false`): each suite gets its own database, but they all
// share `process.env`. A suite that assigns OFFICER_EMAIL in `beforeAll` and
// walks away leaves its officer credentials behind, and every later suite that
// signs in as the default officer is refused. That is not hypothetical — it
// made two unrelated suites fail while both passed in isolation, which is the
// shape of failure that costs an afternoon.
//
// Restores ABSENCE as well as value: a variable that was unset goes back to
// unset. Assigning "" instead would be its own version of the bug, because
// `process.env.X` would then be a defined empty string rather than undefined.
//
//     const env = scopedEnv();
//     beforeAll(() => { env.set("OFFICER_EMAIL", "suite@example.com"); });
//     afterAll(() => { env.restoreAll(); });
export interface ScopedEnv {
  set(key: string, value: string): void;
  restoreAll(): void;
}

export const scopedEnv = (): ScopedEnv => {
  const original = new Map<string, string | undefined>();
  return {
    set(key: string, value: string): void {
      // FIRST write wins as the thing to restore: a suite that sets the same
      // key twice must still end up with what the process started with, not
      // with its own first assignment.
      if (!original.has(key)) {
        original.set(key, process.env[key]);
      }
      process.env[key] = value;
    },
    restoreAll(): void {
      for (const [key, value] of original) {
        if (value === undefined) {
          Reflect.deleteProperty(process.env, key);
        } else {
          process.env[key] = value;
        }
      }
      original.clear();
    },
  };
};
