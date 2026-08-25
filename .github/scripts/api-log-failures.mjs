#!/usr/bin/env node
// Pull the lines out of the API log that explain a 500, so a CI failure is
// diagnosable without admin rights (KNOWN_ISSUES K-25, K-31).
//
// K-31 — the exit journey intermittently failing at POST /assets/:id/tokenize
// with a 500 — has gone unexplained for weeks for one reason: the API log is
// written to the job's step summary, which only an admin can read. The browser
// failures stopped being mysteries when K-25's fix published them as commit
// statuses. This is that same fix, for the other half of the picture.
//
// STANDALONE, like the hooks in .claude/hooks: run it against any API log and
// read exactly what it would publish.
//
//     node .github/scripts/api-log-failures.mjs /tmp/api.log
//
// Prints one candidate per line, most recent last. Prints NOTHING and exits 0
// when there is no log or no error in it — a diagnostic that failed the job it
// is diagnosing would hide the very failure it exists to explain.

import { readFileSync } from "node:fs";

// Commit status descriptions are capped by the API; 130 leaves room for the
// context label without the tail being silently eaten.
const MAX_LENGTH = 130;
// Enough for the message plus the frames that locate it, few enough that the
// commit-status list stays readable.
const MAX_LINES = 4;

// Written as an escape, not a literal control byte, so the source stays
// plain ASCII and survives copy-paste through a terminal.
const ANSI = /\u001b\[[0-9;]*m/g;
// Nest's own format: "[Nest] 4711 - <date>   ERROR [Context] <message>".
const NEST_ERROR = /\bERROR\b\s*(?:\[[^\]]+\]\s*)?(.*)$/;
const STACK_FRAME = /^\s*at\s+\S/;

export const apiLogFailures = (contents) => {
  const lines = contents.replace(ANSI, "").split("\n");
  const found = [];

  for (const [index, raw] of lines.entries()) {
    const match = NEST_ERROR.exec(raw);
    if (match === null) continue;
    const message = (match[1] ?? "").trim();
    if (message !== "") found.push(message);

    // The first stack frame names WHERE it broke. Without it the message alone
    // is often the same generic sentence for several different faults.
    const next = lines[index + 1] ?? "";
    if (STACK_FRAME.test(next)) found.push(next.trim());
  }

  // Consecutive duplicates only: the same fault recurring later in the run is
  // information, but a retry loop logging one line ten times in a row would
  // otherwise crowd out everything else.
  const deduped = found.filter((line, i) => line !== found[i - 1]);

  // The LAST few: the failure that broke the run is at the end of the log, and
  // earlier errors are usually startup noise that recovered.
  return deduped.slice(-MAX_LINES).map((line) => line.slice(0, MAX_LENGTH));
};

const path = process.argv[2];
if (path !== undefined) {
  let contents = "";
  try {
    contents = readFileSync(path, "utf8");
  } catch {
    // No log means the API never started, which the workflow's own readiness
    // check already reports. Staying silent keeps that the message a reader
    // sees, rather than burying it under a second, vaguer one.
    process.exit(0);
  }
  for (const line of apiLogFailures(contents)) console.log(line);
}
