#!/usr/bin/env node
// Prove that the workflow step which publishes API errors actually works —
// WITHOUT waiting for a red build to find out (KNOWN_ISSUES K-31).
//
// The problem this solves: `api-log-failures.mjs` is verifiable on its own, but
// the step that calls it only runs on failure, so in a healthy repository it is
// never exercised. A diagnostic that silently rots is worse than none, because
// the next outage is when you discover it — which is precisely the trap K-31
// sat in for weeks.
//
// It reads the step's script OUT OF ci.yml and runs THAT. A copy would drift
// from the workflow and quietly start testing nothing; anything that stops this
// finding the real step is a hard failure, not a skip.
//
//     node .github/scripts/verify-api-failure-step.mjs
//
// Exits 0 when the step publishes what it should, non-zero with a reason
// otherwise. Safe to run anywhere: it stubs the GitHub client and never calls
// the network.

import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const WORKFLOW = ".github/workflows/ci.yml";
const STEP_NAME = "Publish the API's own error where it can be read";

const fail = (reason) => {
  console.error(`verify-api-failure-step: ${reason}`);
  process.exit(1);
};

// Pull the `script: |` block belonging to the named step. Textual rather than
// YAML-parsed so this needs no dependency; every way it can go wrong throws.
const extractStepScript = (yaml, stepName) => {
  const lines = yaml.split("\n");
  const start = lines.findIndex((line) => line.includes(`- name: ${stepName}`));
  if (start === -1) fail(`no step named "${stepName}" in ${WORKFLOW}`);

  const scriptAt = lines.findIndex((line, i) => i > start && /^\s*script:\s*\|/.test(line));
  if (scriptAt === -1) fail(`step "${stepName}" has no "script: |" block`);

  // Guard against latching onto a LATER step's script when this one has none:
  // the block must belong to the step we found, not to whatever follows it.
  const nextStep = lines.findIndex((line, i) => i > start && /^\s*- name:/.test(line));
  if (nextStep !== -1 && scriptAt > nextStep) fail(`the "script: |" found belongs to a later step`);

  const indent = (lines[scriptAt].match(/^\s*/) ?? [""])[0].length;
  const body = [];
  for (let i = scriptAt + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.trim() !== "" && (line.match(/^\s*/) ?? [""])[0].length <= indent) break;
    body.push(line.slice(indent + 2));
  }
  if (body.join("").trim() === "") fail("the step's script block is empty");
  return body.join("\n");
};

// A realistic failure: what an ethers revert looks like through Nest's logger,
// which is the shape K-31 has been producing and nobody could read.
const SAMPLE_LOG = [
  "[Nest] 4711  - 08/25/2026, 12:50:01 PM     LOG [NestFactory] Starting Nest application...",
  '[Nest] 4711  - 08/25/2026, 12:50:40 PM   ERROR [DomainErrorFilter] could not coalesce error (code=-32603, method="eth_sendRawTransaction")',
  "    at makeError (/app/node_modules/ethers/lib.commonjs/utils/errors.js:129:21)",
  "[Nest] 4711  - 08/25/2026, 12:50:41 PM     LOG [OutboxDrainWorker] drained 0 messages",
].join("\n");

const run = async () => {
  const script = extractStepScript(readFileSync(WORKFLOW, "utf8"), STEP_NAME);

  const logPath = join(mkdtempSync(join(tmpdir(), "api-log-")), "api.log");
  writeFileSync(logPath, SAMPLE_LOG);

  const published = [];
  // Captured rather than discarded: the step reports how many lines it found,
  // and a run that publishes nothing should still be able to say why.
  const logged = [];
  const core = {
    info: (message) => {
      logged.push(String(message));
    },
  };
  const context = { repo: { owner: "owner", repo: "repo" }, sha: "sha" };
  const github = {
    rest: {
      repos: {
        createCommitStatus: (args) => {
          published.push(args);
          return Promise.resolve();
        },
      },
    },
  };

  // github-script evaluates the body as an ASYNC FUNCTION in a CommonJS
  // context. Reproducing that exactly is the point: a top-level `await import`
  // of an absolute path is the part most likely to break, and it would only
  // ever break on a build that was already failing.
  const AsyncFunction = Object.getPrototypeOf(async function probe() {
    return undefined;
  }).constructor;
  const { createRequire } = await import("node:module");
  const require = createRequire(import.meta.url);

  process.env.GITHUB_WORKSPACE = process.cwd();
  process.env.API_LOG_PATH = logPath;

  try {
    await new AsyncFunction("require", "core", "context", "github", script)(
      require,
      core,
      context,
      github,
    );
  } catch (error) {
    fail(`the step threw: ${error.message}`);
  }

  if (published.length === 0) {
    fail(
      `the step published nothing for a log containing an ERROR (it said: ${logged.join("; ")})`,
    );
  }
  const first = published[0];
  if (first.state !== "failure") fail(`expected state "failure", got "${first.state}"`);
  if (!/^api-failure-\d+$/.test(first.context)) fail(`unexpected context "${first.context}"`);
  if (!first.description.includes("could not coalesce error")) {
    fail(`the description does not carry the API's error: "${first.description}"`);
  }
  // The frame is what separates one generic message from another.
  if (!published.some((s) => s.description.includes("at makeError"))) {
    fail("the stack frame that locates the error was not published");
  }

  // A missing log must be silent, not fatal: this step runs while the job is
  // ALREADY failing, and a diagnostic that throws would replace the real
  // failure with its own.
  published.length = 0;
  process.env.API_LOG_PATH = join(mkdtempSync(join(tmpdir(), "api-log-")), "absent.log");
  try {
    await new AsyncFunction("require", "core", "context", "github", script)(
      require,
      core,
      context,
      github,
    );
  } catch (error) {
    fail(`the step threw when the log was missing: ${error.message}`);
  }
  if (published.length !== 0) fail("the step invented statuses with no log to read");

  console.log(`verify-api-failure-step: OK — publishes api-failure-N, silent with no log`);
};

await run();
