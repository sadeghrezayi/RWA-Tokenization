import { readFileSync } from "node:fs";
import { expect } from "@playwright/test";
import type { APIRequestContext, APIResponse, PlaywrightWorkerArgs } from "@playwright/test";

// The `playwright` worker fixture, named: it is what creates request contexts.
type PlaywrightFixture = PlaywrightWorkerArgs["playwright"];

// Fixtures for the Phase-2 exit journey.
//
// Everything an investor cannot do for themselves — approving an asset,
// tokenizing it, opening an offering — is seeded through the API as the
// operator would. The investor's own path stays in the browser, because that
// is what this suite exists to prove.
//
// EACH ACTOR GETS ITS OWN REQUEST CONTEXT. A Playwright request context keeps
// cookies, and the API deliberately lets a session cookie outrank a bearer
// token (auth.guard.ts) — so sharing one context between the officer and a
// holder would quietly run the holder's calls as the officer. Separate
// contexts keep each actor honestly itself, and each carries the CSRF token
// its own session was issued, exactly as a browser does.
export const apiBase = (): string => process.env.API_BASE_URL ?? "http://localhost:3001";

const OFFICER = { email: "officer@platform.local", password: "officer-dev-pass" };
const CSRF_COOKIE = "tk_csrf";
const CSRF_HEADER = "x-csrf-token";

export interface Actor {
  api: APIRequestContext;
  csrf: string;
}

const DOSSIER_KINDS = [
  "ownership_evidence",
  "spv_structure",
  "right_definition",
  "valuation_report",
  "counsel_signoff",
  "custody_agreement",
] as const;

const CHECKLIST_ITEMS = [
  "legal_right_clear",
  "transferable",
  "custodian_engaged",
  "valuation_current",
] as const;

// A 1×1 PNG. The evidence store accepts images and PDFs only, so a text file
// is refused — as it should be.
export const PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const csrfOf = async (api: APIRequestContext): Promise<string> => {
  const state = await api.storageState();
  const cookie = state.cookies.find((candidate) => candidate.name === CSRF_COOKIE);
  expect(cookie, "the session issued no CSRF cookie").toBeDefined();
  return cookie?.value ?? "";
};

const actorFrom = async (
  playwright: PlaywrightFixture,
  path: string,
  credentials: { email: string; password: string },
): Promise<Actor> => {
  const api = await playwright.request.newContext({ baseURL: apiBase() });
  const response = await api.post(path, { data: credentials });
  expect(response.ok(), `${credentials.email} could not sign in: ${await response.text()}`).toBe(
    true,
  );
  return { api, csrf: await csrfOf(api) };
};

export const asOfficer = (playwright: PlaywrightFixture): Promise<Actor> =>
  actorFrom(playwright, "/auth/officer/login", OFFICER);

export const asInvestor = (
  playwright: PlaywrightFixture,
  email: string,
  password: string,
): Promise<Actor> => actorFrom(playwright, "/auth/login", { email, password });

export const registerInvestorVia = async (
  playwright: PlaywrightFixture,
  email: string,
  password: string,
): Promise<Actor> => {
  const api = await playwright.request.newContext({ baseURL: apiBase() });
  const created = await api.post("/investors", { data: { email, password } });
  expect(created.ok(), `could not register ${email}: ${await created.text()}`).toBe(true);
  await api.dispose();
  return asInvestor(playwright, email, password);
};

export const post = async (actor: Actor, path: string, data?: unknown): Promise<APIResponse> =>
  actor.api.post(path, {
    headers: { [CSRF_HEADER]: actor.csrf },
    ...(data !== undefined ? { data } : {}),
  });

// A 500 deliberately says nothing to the client, and CI job logs need admin
// rights to read — so a browser-test failure caused by a server fault is
// otherwise undiagnosable. The API logs its cause; attaching the tail to the
// assertion carries it into the failure annotation, which is readable.
const apiLogTail = (): string => {
  const path = process.env.API_LOG_PATH;
  if (path === undefined || path === "") return "";
  try {
    // ERROR lines only, and few of them. A raw tail is mostly Nest's startup
    // banner, and the annotation that carries this gets truncated — which is
    // how an earlier attempt at this diagnostic showed nothing but route
    // registrations and no fault at all.
    const failures = readFileSync(path, "utf8")
      .split("\n")
      .filter((line) => /\bERROR\b|\bFATAL\b/.test(line))
      .slice(-6);
    return failures.length === 0
      ? `\n(no ERROR lines in ${path})`
      : `\n--- ${path} errors ---\n${failures.join("\n")}`;
  } catch {
    return `\n(could not read ${path})`;
  }
};

const ok = async (actor: Actor, path: string, data?: unknown): Promise<APIResponse> => {
  const response = await post(actor, path, data);
  const detail =
    response.status() >= 500 ? `${await response.text()}${apiLogTail()}` : await response.text();
  expect(response.ok(), `POST ${path} failed (${String(response.status())}): ${detail}`).toBe(true);
  return response;
};

// An asset all the way to a token: proposed → structured → dossier complete →
// every document REVIEWED → custody recorded → checklist confirmed → approved →
// tokenized. The long way
// round on purpose — the shortcut would skip the legal-before-token gate this
// platform exists to enforce.
export const seedTokenizedAsset = async (officer: Actor, name: string): Promise<string> => {
  const created = await ok(officer, "/assets", { name });
  const assetId = ((await created.json()) as { assetId: string }).assetId;

  await ok(officer, `/assets/${assetId}/start-structuring`);
  for (const kind of DOSSIER_KINDS) {
    await ok(officer, `/assets/${assetId}/documents`, {
      kind,
      title: kind,
      contentBase64: Buffer.from(`${kind} for ${name}`).toString("base64"),
    });
    // 4.3: approval requires that a person reviewed and accepted each
    // document. Skipping this would be skipping the gate, not shortening the
    // setup — the same reason this helper takes the long way round at all.
    await ok(officer, `/assets/${assetId}/documents/${kind}/accept`);
  }
  await ok(officer, `/assets/${assetId}/custody`, {
    custodianName: "Pilot Custodian Co.",
    location: "Tehran",
  });
  for (const item of CHECKLIST_ITEMS) {
    await ok(officer, `/assets/${assetId}/checklist/${item}`);
  }
  await ok(officer, `/assets/${assetId}/approve`);
  await ok(officer, `/assets/${assetId}/tokenize`, { symbol: "JRN" });
  return assetId;
};

export interface OfferingTerms {
  assetId: string;
  priceRial: string;
  supply: string;
  minPerInvestor: string;
  maxPerInvestor: string;
  minimumRaise: string;
  // Seconds from now. A window that has already ended cannot be opened, so a
  // test that needs to CLOSE an offering opens a short one and waits it out.
  closesInSeconds: number;
  publish?: boolean;
}

export const seedOpenOffering = async (officer: Actor, terms: OfferingTerms): Promise<string> => {
  const created = await ok(officer, "/offerings", {
    assetId: terms.assetId,
    supply: terms.supply,
    priceRial: terms.priceRial,
    minPerInvestor: terms.minPerInvestor,
    maxPerInvestor: terms.maxPerInvestor,
    minimumRaise: terms.minimumRaise,
    opensAt: new Date(Date.now() - 60_000).toISOString(),
    closesAt: new Date(Date.now() + terms.closesInSeconds * 1000).toISOString(),
  });
  const offeringId = ((await created.json()) as { offeringId: string }).offeringId;

  await ok(officer, `/offerings/${offeringId}/open`);
  if (terms.publish === true) {
    await ok(officer, `/offerings/${offeringId}/publish`);
  }
  return offeringId;
};

// KYC review starts from a SUBMITTED application — there is no longer a way to
// reach a reviewer with nothing attached (2.3e removed it). A test that only
// needs an eligible holder still has to file a real application.
export const submitOnboarding = async (holder: Actor): Promise<void> => {
  await ok(holder, "/onboarding/start");
  await ok(holder, "/onboarding/me/steps/profile/answers", {
    answers: {
      fullName: "Seeded Test Holder",
      nationalId: "0012345678",
      dateOfBirth: "1990-05-05",
      addressLine: "12 Vanak Street",
      city: "Tehran",
    },
  });
  await ok(holder, "/onboarding/me/steps/bank_account/answers", {
    answers: {
      accountHolder: "Seeded Test Holder",
      bankName: "Bank Melli Iran",
      iban: "IR820540102680020817909002",
    },
  });
  await ok(holder, "/onboarding/me/steps/suitability/answers", {
    answers: { investmentExperience: "some", riskTolerance: "medium", sourceOfFunds: "salary" },
  });
  await ok(holder, "/onboarding/me/steps/agreements/answers", {
    answers: { termsAccepted: "true", riskDisclosureAccepted: "true" },
  });

  const uploaded = await holder.api.post("/onboarding/me/evidence", {
    headers: { [CSRF_HEADER]: holder.csrf },
    multipart: {
      step: "identity_evidence",
      file: { name: "identity.png", mimeType: "image/png", buffer: PIXEL_PNG },
    },
  });
  expect(uploaded.ok(), `evidence upload failed: ${await uploaded.text()}`).toBe(true);

  for (const step of [
    "profile",
    "identity_evidence",
    "bank_account",
    "suitability",
    "agreements",
  ]) {
    await ok(holder, `/onboarding/me/steps/${step}/complete`);
  }
  await ok(holder, "/onboarding/me/submit");
};

export const approveKyc = async (officer: Actor, investorId: string): Promise<void> => {
  await ok(officer, `/investors/${investorId}/kyc/start-review`);
  await ok(officer, `/investors/${investorId}/kyc/approve`);
};

export const investorIdOf = async (holder: Actor): Promise<string> => {
  const response = await holder.api.get("/investors/me");
  expect(response.ok(), "could not read the investor").toBe(true);
  return ((await response.json()) as { id: string }).id;
};

// Money in, the way the platform actually does it: the holder declares a
// transfer, treasury confirms what arrived (OD-6).
export const fundInvestor = async (
  holder: Actor,
  officer: Actor,
  amountRial: string,
): Promise<void> => {
  const opened = await ok(holder, "/funding/me", { amountRial });
  const { request } = (await opened.json()) as { request: { id: string } };
  await ok(officer, `/funding/${request.id}/confirm`, { receivedRial: amountRial });
};

export const subscribe = async (
  holder: Actor,
  offeringId: string,
  tokens: string,
): Promise<void> => {
  await ok(holder, `/offerings/${offeringId}/subscribe`, { tokens });
};

// Closing needs the subscription window to have ended, and the window is real
// wall-clock time — there is no test clock in the running server, and adding
// one would be a backdoor in production code.
export const closeWhenWindowEnds = async (
  officer: Actor,
  offeringId: string,
): Promise<{ state: string }> => {
  const deadline = Date.now() + 90_000;
  for (;;) {
    const response = await post(officer, `/offerings/${offeringId}/close`);
    if (response.ok()) {
      return (await response.json()) as { state: string };
    }
    const body = await response.text();
    if (Date.now() > deadline) {
      throw new Error(`could not close the offering: ${body}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
};

// 3.3g/3.3h: an approved issuer with a verified person and assets it brought.
// The issuer portal's screens cannot be measured without one — an empty table
// fits any viewport, which would make the contract pass for the wrong reason.
export const seedIssuerWithAssets = async (
  playwright: PlaywrightFixture,
  officer: Actor,
  assetNames: string[],
): Promise<{ organisationId: string; email: string; password: string }> => {
  const email = `issuer-layout-${String(Date.now())}-${String(Math.floor(Math.random() * 100000))}@example.com`;
  const password = "Passw0rd-issuer-layout-1";
  const founder = await registerInvestorVia(playwright, email, password);

  // Applying for an organisation requires individual verification, on the same
  // record any other person is verified on.
  await submitOnboarding(founder);
  await approveKyc(officer, await investorIdOf(founder));

  const applied = await post(founder, "/issuers", {
    legalName: "Layout Contract Holdings PJSC",
    registrationNumber: `IR-${String(Date.now()).slice(-6)}`,
    contactEmail: email,
  });
  expect(applied.ok(), `could not apply as an issuer: ${await applied.text()}`).toBe(true);
  const { organisationId } = (await applied.json()) as { organisationId: string };

  await ok(officer, `/issuers/${organisationId}/start-review`);
  await ok(officer, `/issuers/${organisationId}/approve`);

  for (const name of assetNames) {
    const brought = await post(founder, `/issuers/${organisationId}/assets`, { name });
    expect(brought.ok(), `could not bring ${name}: ${await brought.text()}`).toBe(true);
  }

  return { organisationId, email, password };
};
