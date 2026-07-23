import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../../src/app.module.js";
import { PrismaService } from "../../src/infrastructure/persistence/prisma.service.js";

// 1.3b: httpOnly session cookie + double-submit CSRF (T4/T21). Officer login is
// used because it needs no seeded investor; submitKyc is a convenient
// authenticated state-changing route to exercise CSRF (investor role).
describe("Auth cookie + CSRF API (e2e, real Postgres)", () => {
  let app: INestApplication;
  let server: Parameters<typeof request>[0];
  const email = `cookie-${randomUUID()}@example.com`;
  // A separate, fresh investor (draft KYC) whose bearer token exercises the
  // bearer-auth path independently of the cookie investor's state.
  const bearerEmail = `bearer-${randomUUID()}@example.com`;
  let bearer: string;

  const cookiesFrom = (res: request.Response): string[] => {
    const set = res.headers["set-cookie"];
    return Array.isArray(set) ? set : set ? [set] : [];
  };
  const cookieHeader = (cookies: string[]): string =>
    cookies.map((c) => c.split(";")[0]).join("; ");
  const csrfFrom = (cookies: string[]): string => {
    const raw = cookies.find((c) => c.startsWith("tk_csrf="));
    return raw === undefined ? "" : (raw.split(";")[0]?.split("=")[1] ?? "");
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer() as Parameters<typeof request>[0];
    await request(server).post("/investors").send({ email, password: "Passw0rd-9" }).expect(201);
    await request(server).post("/investors").send({ email: bearerEmail, password: "Passw0rd-9" });
    const login = await request(server)
      .post("/auth/login")
      .send({ email: bearerEmail, password: "Passw0rd-9" })
      .expect(200);
    bearer = (login.body as { token: string }).token;
  }, 30_000);

  afterAll(async () => {
    const prisma = app.get(PrismaService);
    await prisma.loginAttempt.deleteMany({
      where: { key: { in: [email.toLowerCase(), bearerEmail.toLowerCase()] } },
    });
    await app.close();
  });

  it("login_sets_an_httponly_session_cookie_and_a_readable_csrf_cookie", async () => {
    const res = await request(server)
      .post("/auth/login")
      .send({ email, password: "Passw0rd-9" })
      .expect(200);
    const cookies = cookiesFrom(res);
    const session = cookies.find((c) => c.startsWith("tk_session="));
    const csrf = cookies.find((c) => c.startsWith("tk_csrf="));
    expect(session).toMatch(/HttpOnly/);
    expect(session).toMatch(/SameSite=Lax/);
    expect(csrf).toBeDefined();
    expect(csrf).not.toMatch(/HttpOnly/); // client must read it for double-submit
    expect((res.body as { csrfToken: string }).csrfToken).toHaveLength(48);
  });

  it("authenticates_a_GET_via_the_session_cookie_alone", async () => {
    const login = await request(server).post("/auth/login").send({ email, password: "Passw0rd-9" });
    const jar = cookieHeader(cookiesFrom(login));
    await request(server).get("/investors/me").set("Cookie", jar).expect(200);
  });

  it("rejects_a_cookie_authenticated_POST_without_the_csrf_header", async () => {
    const login = await request(server).post("/auth/login").send({ email, password: "Passw0rd-9" });
    const jar = cookieHeader(cookiesFrom(login));
    await request(server).post("/investors/me/kyc/submit").set("Cookie", jar).expect(403);
  });

  it("allows_a_cookie_authenticated_POST_with_a_matching_csrf_header", async () => {
    const login = await request(server).post("/auth/login").send({ email, password: "Passw0rd-9" });
    const cookies = cookiesFrom(login);
    await request(server)
      .post("/investors/me/kyc/submit")
      .set("Cookie", cookieHeader(cookies))
      .set("x-csrf-token", csrfFrom(cookies))
      .expect(204);
  });

  it("still_accepts_bearer_auth_without_any_csrf_token", async () => {
    // Bearer requests cannot be forged cross-site, so CSRF does not apply.
    await request(server)
      .post("/investors/me/kyc/submit")
      .set("authorization", `Bearer ${bearer}`)
      .expect(204);
  });

  it("logout_clears_the_session_cookies", async () => {
    const res = await request(server)
      .post("/auth/logout")
      .set("authorization", `Bearer ${bearer}`)
      .expect(204);
    const cleared = cookiesFrom(res);
    expect(cleared.find((c) => c.startsWith("tk_session="))).toMatch(/Max-Age=0/);
    expect(cleared.find((c) => c.startsWith("tk_csrf="))).toMatch(/Max-Age=0/);
  });
});
