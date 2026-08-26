#!/usr/bin/env node
// Prove that the workflow steps which explain a failure actually work — WITHOUT
// waiting for a red build to find out (KNOWN_ISSUES K-25, K-31, K-40).
//
// Both diagnostics run only `if: failure()`, so on a healthy repository neither
// is ever exercised. A diagnostic that has silently rotted is worse than none,
// because the outage is when you discover it — which is the trap K-31 sat in
// for weeks.
//
// Each check reads the step's script OUT OF ci.yml and runs THAT. A copy would
// drift from the workflow and quietly start testing nothing, so anything that
// stops this finding the real step is a hard failure, never a skip.
//
//     node .github/scripts/verify-ci-diagnostics.mjs
//
// Exits 0 when both steps publish what they should, non-zero with a reason
// otherwise. Safe to run anywhere: the GitHub client is stubbed and nothing
// touches the network.

import { readFileSync, writeFileSync, mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const WORKFLOW = ".github/workflows/ci.yml";
const API_STEP = "Publish the API's own error where it can be read";
const BROWSER_STEP = "Publish the failing test names where they can be read";

const REPO_ROOT = process.cwd();
const require = createRequire(import.meta.url);

const fail = (reason) => {
  console.error(`verify-ci-diagnostics: ${reason}`);
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
  if (nextStep !== -1 && scriptAt > nextStep) {
    fail(`the "script: |" found after "${stepName}" belongs to a later step`);
  }

  const indent = (lines[scriptAt].match(/^\s*/) ?? [""])[0].length;
  const body = [];
  for (let i = scriptAt + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.trim() !== "" && (line.match(/^\s*/) ?? [""])[0].length <= indent) break;
    body.push(line.slice(indent + 2));
  }
  if (body.join("").trim() === "") fail(`the script block for "${stepName}" is empty`);
  return body.join("\n");
};

// github-script evaluates the body as an ASYNC FUNCTION in a CommonJS context.
// Reproducing that exactly is the point: the API step's absolute-path
// `await import` is the line most likely to break, and it would otherwise only
// ever break on a build that was already failing.
const AsyncFunction = Object.getPrototypeOf(async function probe() {
  return undefined;
}).constructor;

const runStep = async (script, { label }) => {
  const published = [];
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

  try {
    await new AsyncFunction("require", "core", "context", "github", script)(
      require,
      core,
      context,
      github,
    );
  } catch (error) {
    fail(`${label}: the step threw — ${error.message}`);
  }
  return { published, logged };
};

const tempDir = (prefix) => mkdtempSync(join(tmpdir(), prefix));

// ---------------------------------------------------------------------------
// The API-error step (K-31)
// ---------------------------------------------------------------------------

// What an ethers revert looks like through Nest's logger — the shape K-31 has
// been producing and nobody could read.
const SAMPLE_API_LOG = [
  "[Nest] 4711  - 08/25/2026, 12:50:01 PM     LOG [NestFactory] Starting Nest application...",
  '[Nest] 4711  - 08/25/2026, 12:50:40 PM   ERROR [DomainErrorFilter] could not coalesce error (code=-32603, method="eth_sendRawTransaction")',
  "    at makeError (/app/node_modules/ethers/lib.commonjs/utils/errors.js:129:21)",
  "[Nest] 4711  - 08/25/2026, 12:50:41 PM     LOG [OutboxDrainWorker] drained 0 messages",
].join("\n");

const checkApiFailureStep = async (yaml) => {
  const script = extractStepScript(yaml, API_STEP);

  const logPath = join(tempDir("api-log-"), "api.log");
  writeFileSync(logPath, SAMPLE_API_LOG);
  process.env.GITHUB_WORKSPACE = REPO_ROOT;
  process.env.API_LOG_PATH = logPath;

  const { published, logged } = await runStep(script, { label: "api step" });

  if (published.length === 0) {
    fail(
      `api step: published nothing for a log containing an ERROR (it said: ${logged.join("; ")})`,
    );
  }
  const first = published[0];
  if (first.state !== "failure") fail(`api step: expected state "failure", got "${first.state}"`);
  if (!/^api-failure-\d+$/.test(first.context)) fail(`api step: bad context "${first.context}"`);
  if (!first.description.includes("could not coalesce error")) {
    fail(`api step: the description does not carry the API's error: "${first.description}"`);
  }
  // The frame is what separates one generic message from another.
  if (!published.some((s) => s.description.includes("at makeError"))) {
    fail("api step: the stack frame that locates the error was not published");
  }

  // A missing log must be SILENT, not fatal: this runs while the job is already
  // failing, and a diagnostic that throws replaces the real failure with its own.
  process.env.API_LOG_PATH = join(tempDir("api-log-"), "absent.log");
  const absent = await runStep(script, { label: "api step (no log)" });
  if (absent.published.length !== 0) fail("api step: invented statuses with no log to read");
};

// ---------------------------------------------------------------------------
// The browser-failure step (K-25, K-40)
// ---------------------------------------------------------------------------

const playwrightReport = ({ status, duration, message, title }) => ({
  suites: [
    {
      // NESTED, because the walk recurses and a flat fixture would never prove
      // it — Playwright nests a file's suites under the project's.
      suites: [
        {
          specs: [{ title, tests: [{ results: [{ status, duration, error: { message } }] }] }],
        },
      ],
    },
  ],
});

// The real a11y failure from 5525e02, which is what K-40 is about.
const TIMED_OUT_MESSAGE = [
  "Error: expect(locator).toBeHidden() failed",
  "",
  "Locator: getByLabel('Email')",
  "Expected: hidden",
  "Received string: visible",
].join("\n");

const runBrowserStep = async (script, report) => {
  // The step reads a RELATIVE path, so it is driven from a throwaway working
  // directory rather than by writing a report into the repo.
  const dir = tempDir("pw-report-");
  if (report !== undefined) {
    mkdirSync(join(dir, "apps", "web"), { recursive: true });
    writeFileSync(join(dir, "apps", "web", "playwright-report.json"), JSON.stringify(report));
  }
  process.chdir(dir);
  try {
    return await runStep(script, { label: "browser step" });
  } finally {
    process.chdir(REPO_ROOT);
  }
};

const checkBrowserFailureStep = async (yaml) => {
  const script = extractStepScript(yaml, BROWSER_STEP);

  // A TIMEOUT must be labelled as one. "the assertion is wrong" and "the app
  // was too slow" need opposite responses and looked identical before K-40.
  const timedOut = await runBrowserStep(
    script,
    playwrightReport({
      status: "timedOut",
      duration: 30_000,
      message: TIMED_OUT_MESSAGE,
      title: "a signed-in investor's portal has no detectable violations",
    }),
  );
  if (timedOut.published.length === 0) fail("browser step: published nothing for a failing report");
  const description = timedOut.published[0].description;
  if (!/^browser-failure-\d+$/.test(timedOut.published[0].context)) {
    fail(`browser step: bad context "${timedOut.published[0].context}"`);
  }
  if (!description.includes("[timeout 30s]")) {
    fail(`browser step: a timeout was not labelled as one: "${description}"`);
  }
  if (!description.includes("a signed-in investor")) {
    fail(`browser step: the failing spec is not named: "${description}"`);
  }
  // The received value says what was actually there; without it the run reports
  // half an answer (K-25).
  if (!timedOut.published.some((s) => s.description.startsWith("Received string:"))) {
    fail("browser step: the received value was not published");
  }

  // An ordinary assertion failure must NOT be labelled a timeout.
  const failed = await runBrowserStep(
    script,
    playwrightReport({
      status: "failed",
      duration: 1_200,
      message: "Error: expected 3 but got 4",
      title: "the issuer queue fits the screen",
    }),
  );
  const failedDescription = failed.published[0]?.description ?? "";
  if (!failedDescription.includes("[failed 1s]")) {
    fail(`browser step: an assertion failure was mislabelled: "${failedDescription}"`);
  }

  // No report at all must be silent, for the same reason a missing API log is.
  const absent = await runBrowserStep(script, undefined);
  if (absent.published.length !== 0) fail("browser step: invented statuses with no report to read");
};

const yaml = readFileSync(WORKFLOW, "utf8");
await checkApiFailureStep(yaml);
await checkBrowserFailureStep(yaml);
console.log(
  "verify-ci-diagnostics: OK — api-failure-N and browser-failure-N both publish, both silent when there is nothing to read",
);
