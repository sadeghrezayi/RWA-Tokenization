import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../../src/app.module.js";
import { PrismaService } from "../../src/infrastructure/persistence/prisma.service.js";
import type { RecipientKind } from "../../src/domain/notifications/notification.js";

// 1.7b: the self-scoped notifications API against real Postgres. Notifications
// are seeded directly (the event triggers that raise them land in 1.7c).
describe("Notifications API (e2e, real Postgres)", () => {
  let app: INestApplication;
  let server: Parameters<typeof request>[0];
  let prisma: PrismaService;
  let bearer: string;
  let investorId: string;
  const email = `notif-${randomUUID()}@example.com`;
  const PW = "Passw0rd-notif-1";
  const seededIds: string[] = [];

  const seed = async (
    recipientKind: RecipientKind,
    recipientId: string,
    title: string,
    createdAt: Date,
  ): Promise<string> => {
    const id = `ntf-${randomUUID()}`;
    seededIds.push(id);
    await prisma.notification.create({
      data: {
        id,
        tenantId: "default",
        recipientKind,
        recipientId,
        type: "test",
        title,
        body: "b",
        createdAt,
      },
    });
    return id;
  };

  const unreadCount = async (): Promise<number> => {
    const res = await request(server)
      .get("/notifications/unread-count")
      .set("authorization", `Bearer ${bearer}`)
      .expect(200);
    return (res.body as { count: number }).count;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer() as Parameters<typeof request>[0];
    prisma = app.get(PrismaService);

    await request(server).post("/investors").send({ email, password: PW }).expect(201);
    const login = await request(server)
      .post("/auth/login")
      .send({ email, password: PW })
      .expect(200);
    bearer = (login.body as { token: string }).token;
    const me = await request(server)
      .get("/investors/me")
      .set("authorization", `Bearer ${bearer}`)
      .expect(200);
    investorId = (me.body as { id: string }).id;

    await seed("investor", investorId, "older", new Date("2026-07-26T09:00:00Z"));
    await seed("investor", investorId, "newer", new Date("2026-07-26T10:00:00Z"));
    await seed("investor", "inv-stranger", "not mine", new Date("2026-07-26T11:00:00Z"));
  }, 30_000);

  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { id: { in: seededIds } } });
    const investor = await prisma.investor.findFirst({ where: { email: email.toLowerCase() } });
    if (investor) {
      await prisma.emailVerificationToken.deleteMany({ where: { investorId: investor.id } });
    }
    await prisma.loginAttempt.deleteMany({ where: { key: email.toLowerCase() } });
    await prisma.outboxMessage.deleteMany({});
    await app.close();
  });

  it("lists only my notifications, newest first", async () => {
    const res = await request(server)
      .get("/notifications")
      .set("authorization", `Bearer ${bearer}`)
      .expect(200);
    const titles = (res.body as { title: string }[]).map((n) => n.title);
    expect(titles).toEqual(["newer", "older"]);
    expect(titles).not.toContain("not mine");
  });

  it("reports my unread count", async () => {
    expect(await unreadCount()).toBe(2);
  });

  it("marks one notification read", async () => {
    const list = await request(server)
      .get("/notifications")
      .set("authorization", `Bearer ${bearer}`)
      .expect(200);
    const id = (list.body as { id: string }[])[0]?.id ?? "";

    await request(server)
      .post(`/notifications/${id}/read`)
      .set("authorization", `Bearer ${bearer}`)
      .expect(204);

    expect(await unreadCount()).toBe(1);
  });

  it("marks all remaining read", async () => {
    await request(server)
      .post("/notifications/read-all")
      .set("authorization", `Bearer ${bearer}`)
      .expect(204);
    expect(await unreadCount()).toBe(0);
  });

  it("cannot mark another recipient's notification read (404)", async () => {
    const strangerId = seededIds[2] ?? "";
    await request(server)
      .post(`/notifications/${strangerId}/read`)
      .set("authorization", `Bearer ${bearer}`)
      .expect(404);
  });

  it("requires authentication", async () => {
    await request(server).get("/notifications").expect(401);
  });
});
