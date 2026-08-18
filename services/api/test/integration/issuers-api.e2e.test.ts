import { randomUUID } from "node:crypto";
import argon2 from "argon2";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../../src/app.module.js";
import { PrismaService } from "../../src/infrastructure/persistence/prisma.service.js";
import type {
  IssuerMemberView,
  IssuerOrganisationView,
  MyIssuerOrganisationView,
} from "../../src/application/issuers/issuer-views.js";

// 3.2e over the real HTTP + Postgres stack. The rule this exists to protect:
// every person acting for an issuer must be individually verified. It is
// enforced in the application layer and proven against Postgres — but WIRING is
// where it could quietly be pointed at something permissive, so it is asserted
// here, through the API, as a person would meet it.
describe("Issuers API (e2e, real Postgres)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: Parameters<typeof request>[0];
  let officer = "";
  let founder = "";
  let colleague = "";
  let stranger = "";
  let unverified = "";

  const PW = "Passw0rd-issuer-1";
  const OFFICER = { email: "issuer-officer@example.com", password: "0fficer-pass-issuer" };
  const auth = (token: string) => ({ authorization: `Bearer ${token}` });
  const founderEmail = `issuer-founder-${randomUUID()}@example.com`;
  const colleagueEmail = `issuer-colleague-${randomUUID()}@example.com`;
  const strangerEmail = `issuer-stranger-${randomUUID()}@example.com`;
  const unverifiedEmail = `issuer-unverified-${randomUUID()}@example.com`;
  const everyone = [founderEmail, colleagueEmail, strangerEmail, unverifiedEmail];

  // Verified means exactly what it means for any other platform user: the same
  // individual verification, on the same record.
  const registerAndLogin = async (address: string, verified: boolean): Promise<string> => {
    await request(server).post("/investors").send({ email: address, password: PW }).expect(201);
    if (verified) {
      await prisma.investor.updateMany({
        where: { email: address.toLowerCase() },
        data: { kycState: "approved" },
      });
    }
    const login = await request(server)
      .post("/auth/login")
      .send({ email: address, password: PW })
      .expect(200);
    return (login.body as { token: string }).token;
  };

  const applyAsIssuer = (token: string) =>
    request(server)
      .post("/issuers")
      .set(auth(token))
      .send({
        legalName: "Vanak Property Holdings PJSC",
        registrationNumber: `IR-${randomUUID().slice(0, 8)}`,
        contactEmail: "ops@vanak.example",
      });

  // Every organisation this suite creates, so cleanup removes exactly its own
  // rows. Wiping the whole table would destroy any local demo data alongside it.
  const created: string[] = [];

  const applied = async (): Promise<string> => {
    const res = await applyAsIssuer(founder).expect(201);
    const { organisationId } = res.body as { organisationId: string };
    created.push(organisationId);
    return organisationId;
  };

  const approved = async (): Promise<string> => {
    const id = await applied();
    await request(server).post(`/issuers/${id}/start-review`).set(auth(officer)).expect(204);
    await request(server).post(`/issuers/${id}/approve`).set(auth(officer)).expect(204);
    return id;
  };

  const teamOf = async (organisationId: string, token: string): Promise<IssuerMemberView[]> => {
    const res = await request(server)
      .get(`/issuers/${organisationId}/members`)
      .set(auth(token))
      .expect(200);
    return res.body as IssuerMemberView[];
  };

  beforeAll(async () => {
    process.env.AUTH_TOKEN_SECRET = "issuer-e2e-secret";
    process.env.OFFICER_EMAIL = OFFICER.email;
    process.env.OFFICER_PASSWORD_HASH = await argon2.hash(OFFICER.password);

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer() as Parameters<typeof request>[0];
    prisma = app.get(PrismaService);

    founder = await registerAndLogin(founderEmail, true);
    colleague = await registerAndLogin(colleagueEmail, true);
    stranger = await registerAndLogin(strangerEmail, true);
    unverified = await registerAndLogin(unverifiedEmail, false);

    const officerLogin = await request(server)
      .post("/auth/officer/login")
      .send(OFFICER)
      .expect(200);
    officer = (officerLogin.body as { token: string }).token;
  }, 30_000);

  afterAll(async () => {
    await prisma.issuerMembership.deleteMany({ where: { organisationId: { in: created } } });
    await prisma.issuerOrganisation.deleteMany({ where: { id: { in: created } } });
    for (const address of everyone) {
      const investor = await prisma.investor.findFirst({ where: { email: address.toLowerCase() } });
      if (investor) {
        await prisma.emailVerificationToken.deleteMany({ where: { investorId: investor.id } });
        await prisma.investor.deleteMany({ where: { id: investor.id } });
      }
      await prisma.loginAttempt.deleteMany({ where: { key: address.toLowerCase() } });
    }
    await prisma.outboxMessage.deleteMany({});
    await app.close();
  });

  it("refuses an application from someone who has not been verified (403)", async () => {
    // The gate, met through the API. If wiring ever points this at a permissive
    // stub, this is the test that fails.
    await applyAsIssuer(unverified).expect(403);
  });

  it("requires authentication to apply at all (401)", async () => {
    await request(server)
      .post("/issuers")
      .send({ legalName: "X", registrationNumber: "Y", contactEmail: "a@b.example" })
      .expect(401);
  });

  it("refuses an application missing what identifies the entity (400)", async () => {
    await request(server)
      .post("/issuers")
      .set(auth(founder))
      .send({ legalName: "Vanak", registrationNumber: "IR-1" })
      .expect(400);
  });

  it("accepts an application from a verified person and makes them its admin", async () => {
    const id = await applied();

    const team = await teamOf(id, founder);
    expect(team).toHaveLength(1);
    expect(team[0]?.email).toBe(founderEmail.toLowerCase());
    expect(team[0]?.canManageTeam).toBe(true);
  });

  it("keeps an applicant out of the platform's review queue (403)", async () => {
    await request(server).get("/issuers").set(auth(founder)).expect(403);
  });

  // 3.3d: what the issuer portal asks first — which organisations are mine?
  it("tells a person which organisations are theirs, and what their role allows", async () => {
    const id = await applied();
    await request(server)
      .post(`/issuers/${id}/members`)
      .set(auth(founder))
      .send({ email: colleagueEmail, role: "issuer_contributor" })
      .expect(204);

    const asFounder = await request(server).get("/issuers/mine").set(auth(founder)).expect(200);
    const founderRow = (asFounder.body as MyIssuerOrganisationView[]).find((r) => r.id === id);
    expect(founderRow?.role).toBe("issuer_admin");
    expect(founderRow?.canManageTeam).toBe(true);
    expect(founderRow?.legalName).toBeTruthy();

    const asColleague = await request(server).get("/issuers/mine").set(auth(colleague)).expect(200);
    const colleagueRow = (asColleague.body as MyIssuerOrganisationView[]).find((r) => r.id === id);
    expect(colleagueRow?.canManageTeam).toBe(false);
    expect(colleagueRow?.canWorkOnAssets).toBe(true);
  });

  it("shows a person nothing when they act for no issuer", async () => {
    const res = await request(server).get("/issuers/mine").set(auth(stranger)).expect(200);

    // Empty, not an error: acting for no issuer is a legitimate state, and the
    // portal has to be able to say "you have no organisation yet".
    expect(res.body).toEqual([]);
  });

  // 3.3f: an issuer reads the assets it brought — and only those.
  it("lets an issuer's person read the assets their organisation brought", async () => {
    const id = await approved();
    const created = await request(server)
      .post("/assets")
      .set(auth(officer))
      .send({ name: "Vanak Tower Floor 7", organisationId: id })
      .expect(201);
    const assetId = (created.body as { assetId: string }).assetId;

    const mine = await request(server).get(`/issuers/${id}/assets`).set(auth(founder)).expect(200);

    const rows = mine.body as { id: string; name: string; organisationName?: string }[];
    expect(rows.map((row) => row.id)).toEqual([assetId]);
    expect(rows[0]?.organisationName).toBeTruthy();
  });

  it("shows an issuer nothing of what the platform or another issuer brought", async () => {
    const id = await approved();
    await request(server)
      .post("/assets")
      .set(auth(officer))
      .send({ name: "Platform's" })
      .expect(201);

    const mine = await request(server).get(`/issuers/${id}/assets`).set(auth(founder)).expect(200);

    expect(mine.body).toEqual([]);
  });

  it("refuses the asset list to someone outside the organisation (403)", async () => {
    const id = await approved();

    // The confidentiality boundary: a stranger must not learn what an issuer
    // is preparing, not even that the list is empty.
    await request(server).get(`/issuers/${id}/assets`).set(auth(stranger)).expect(403);
  });

  // "mine" must not be swallowed by the `:id` route. If it ever is, this asks
  // for an organisation literally named "mine" and gets a 404 or a 403.
  it("reads /issuers/mine as the person's own list, not as an organisation id", async () => {
    await applied();

    const res = await request(server).get("/issuers/mine").set(auth(founder)).expect(200);

    expect(Array.isArray(res.body)).toBe(true);
  });

  it("walks an application through review to approval", async () => {
    const id = await approved();

    const listed = await request(server).get("/issuers").set(auth(officer)).expect(200);
    const mine = (listed.body as IssuerOrganisationView[]).find((row) => row.id === id);
    expect(mine?.state).toBe("approved");
    expect(mine?.canSubmitAssets).toBe(true);
    expect(mine?.decidedBy).toBeTruthy();
    // The decision names a person, not an account id. If the wiring ever loses
    // the staff lookup, this is what fails.
    expect(mine?.decidedByLabel).toBe(OFFICER.email);
  });

  it("gives one organisation its own record, and 404 for one that does not exist", async () => {
    const id = await approved();

    const res = await request(server).get(`/issuers/${id}`).set(auth(officer)).expect(200);
    const view = res.body as IssuerOrganisationView;
    expect(view.legalName).toBe("Vanak Property Holdings PJSC");
    expect(view.canSubmitAssets).toBe(true);
    expect(view.decidedByLabel).toBe(OFFICER.email);

    await request(server).get(`/issuers/${randomUUID()}`).set(auth(officer)).expect(404);
  });

  it("keeps an applicant out of another organisation's record (403)", async () => {
    const id = await applied();

    await request(server).get(`/issuers/${id}`).set(auth(stranger)).expect(403);
  });

  it("refuses approval of something nobody reviewed (409)", async () => {
    const id = await applied();

    await request(server).post(`/issuers/${id}/approve`).set(auth(officer)).expect(409);
  });

  it("rejects with a reason, and refuses one without (400)", async () => {
    const id = await applied();
    await request(server).post(`/issuers/${id}/start-review`).set(auth(officer)).expect(204);

    await request(server)
      .post(`/issuers/${id}/reject`)
      .set(auth(officer))
      .send({ reason: "   " })
      .expect(400);

    await request(server)
      .post(`/issuers/${id}/reject`)
      .set(auth(officer))
      .send({ reason: "registration number does not match the registry" })
      .expect(204);

    const listed = await request(server).get("/issuers").set(auth(officer)).expect(200);
    const rejected = (listed.body as IssuerOrganisationView[]).find((row) => row.id === id);
    expect(rejected?.rejectionReason).toBe("registration number does not match the registry");
    expect(rejected?.canSubmitAssets).toBe(false);
  });

  it("suspends an approved issuer and restores it", async () => {
    const id = await approved();

    await request(server)
      .post(`/issuers/${id}/suspend`)
      .set(auth(officer))
      .send({ reason: "under investigation" })
      .expect(204);

    const suspended = await request(server).get("/issuers").set(auth(officer)).expect(200);
    expect(
      (suspended.body as IssuerOrganisationView[]).find((row) => row.id === id)?.canSubmitAssets,
    ).toBe(false);

    await request(server).post(`/issuers/${id}/reinstate`).set(auth(officer)).expect(204);
    const restored = await request(server).get("/issuers").set(auth(officer)).expect(200);
    expect(
      (restored.body as IssuerOrganisationView[]).find((row) => row.id === id)?.canSubmitAssets,
    ).toBe(true);
  });

  it("will not staff a team with an unverified person (403)", async () => {
    const id = await applied();

    await request(server)
      .post(`/issuers/${id}/members`)
      .set(auth(officer))
      .send({ email: unverifiedEmail, role: "issuer_contributor" })
      .expect(403);

    expect(await teamOf(id, officer)).toHaveLength(1);
  });

  it("lets an issuer admin invite a verified colleague by email", async () => {
    const id = await applied();

    await request(server)
      .post(`/issuers/${id}/members`)
      .set(auth(founder))
      .send({ email: colleagueEmail.toUpperCase(), role: "issuer_contributor" })
      .expect(204);

    const invited = (await teamOf(id, founder)).find(
      (m) => m.email === colleagueEmail.toLowerCase(),
    );
    expect(invited?.role).toBe("issuer_contributor");
    expect(invited?.canManageTeam).toBe(false);
  });

  it("takes a colleague off the team, but never the last administrator (409)", async () => {
    const id = await applied();
    await request(server)
      .post(`/issuers/${id}/members`)
      .set(auth(founder))
      .send({ email: colleagueEmail, role: "issuer_contributor" })
      .expect(204);

    const colleagueId = (await teamOf(id, founder)).find(
      (m) => m.email === colleagueEmail.toLowerCase(),
    )?.userId;
    const founderId = (await teamOf(id, founder)).find(
      (m) => m.email === founderEmail.toLowerCase(),
    )?.userId;

    // The organisation would be left with nobody able to staff it.
    await request(server)
      .delete(`/issuers/${id}/members/${founderId ?? ""}`)
      .set(auth(founder))
      .expect(409);

    await request(server)
      .delete(`/issuers/${id}/members/${colleagueId ?? ""}`)
      .set(auth(founder))
      .expect(204);

    expect((await teamOf(id, founder)).map((m) => m.userId)).toEqual([founderId]);
  });

  it("lets nobody but the team's own admin or staff remove a person (403)", async () => {
    const id = await applied();
    await request(server)
      .post(`/issuers/${id}/members`)
      .set(auth(founder))
      .send({ email: colleagueEmail, role: "issuer_contributor" })
      .expect(204);
    const colleagueId = (await teamOf(id, founder)).find(
      (m) => m.email === colleagueEmail.toLowerCase(),
    )?.userId;

    await request(server)
      .delete(`/issuers/${id}/members/${colleagueId ?? ""}`)
      .set(auth(stranger))
      .expect(403);

    // Staff may act on any organisation's team.
    await request(server)
      .delete(`/issuers/${id}/members/${colleagueId ?? ""}`)
      .set(auth(officer))
      .expect(204);
  });

  it("says plainly when nobody holds the address being invited (404)", async () => {
    const id = await applied();

    await request(server)
      .post(`/issuers/${id}/members`)
      .set(auth(founder))
      .send({ email: `nobody-${randomUUID()}@example.com`, role: "issuer_contributor" })
      .expect(404);
  });

  it("refuses a role the platform does not know (400)", async () => {
    const id = await applied();

    await request(server)
      .post(`/issuers/${id}/members`)
      .set(auth(founder))
      .send({ email: colleagueEmail, role: "owner" })
      .expect(400);
  });

  it("stops a contributor from staffing the team, and a stranger from seeing it (403)", async () => {
    const id = await applied();
    await request(server)
      .post(`/issuers/${id}/members`)
      .set(auth(founder))
      .send({ email: colleagueEmail, role: "issuer_contributor" })
      .expect(204);

    // A contributor prepares assets; deciding who else gets in is the admin's.
    await request(server)
      .post(`/issuers/${id}/members`)
      .set(auth(colleague))
      .send({ email: strangerEmail, role: "issuer_contributor" })
      .expect(403);

    // Someone with no membership at all sees nothing of this team.
    await request(server).get(`/issuers/${id}/members`).set(auth(stranger)).expect(403);
    await request(server)
      .post(`/issuers/${id}/members`)
      .set(auth(stranger))
      .send({ email: strangerEmail, role: "issuer_admin" })
      .expect(403);
  });

  it("does not let an admin of one organisation act on another (403)", async () => {
    const mine = await applied();
    const theirs = await applied();
    await request(server)
      .post(`/issuers/${theirs}/members`)
      .set(auth(founder))
      .send({ email: colleagueEmail, role: "issuer_admin" })
      .expect(204);
    // Promote the colleague in `theirs` only: they must stay powerless in `mine`.
    await request(server)
      .post(`/issuers/${mine}/members`)
      .set(auth(colleague))
      .send({ email: strangerEmail, role: "issuer_contributor" })
      .expect(403);
  });

  it("returns 404 for an organisation that does not exist", async () => {
    await request(server)
      .post(`/issuers/${randomUUID()}/start-review`)
      .set(auth(officer))
      .expect(404);
  });
});
