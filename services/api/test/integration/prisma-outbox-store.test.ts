import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PrismaOutboxStore } from "../../src/infrastructure/persistence/prisma-outbox-store.js";

// 1.6b: the outbox store's durability contract against real Postgres — atomic
// claim (attempts++ and a visibility window), payload redaction on terminal
// states, backoff via reschedule, and the claim limit.
const prisma = new PrismaClient();
const store = new PrismaOutboxStore(prisma);
const soon = (ms = 1000): Date => new Date(Date.now() + ms);

beforeEach(async () => {
  await prisma.outboxMessage.deleteMany({});
});

afterAll(async () => {
  await prisma.outboxMessage.deleteMany({});
  await prisma.$disconnect();
});

describe("PrismaOutboxStore (integration, real Postgres)", () => {
  it("claims a due message, incrementing attempts and hiding it from the next claim", async () => {
    await store.enqueue({ type: "test.a", payload: { to: "x@y.z", token: "tok" } });

    const first = await store.claimDue(soon(), 10);
    expect(first).toHaveLength(1);
    expect(first[0]?.type).toBe("test.a");
    expect(first[0]?.payload).toEqual({ to: "x@y.z", token: "tok" });
    expect(first[0]?.attempts).toBe(1);

    // The claim pushed availableAt into the future — the next claim sees nothing.
    expect(await store.claimDue(soon(), 10)).toHaveLength(0);
  });

  it("marks a message sent, clearing its payload and never re-claiming it", async () => {
    await store.enqueue({ type: "test.b", payload: { to: "a@b.c", token: "secret" } });
    const [msg] = await store.claimDue(soon(), 10);
    if (!msg) throw new Error("expected a claimed message");

    await store.markSent(msg.id, new Date());

    const row = await prisma.outboxMessage.findUnique({ where: { id: msg.id } });
    expect(row?.status).toBe("sent");
    expect(row?.payload).toEqual({}); // secret redacted at rest
    expect(await store.claimDue(soon(3_600_000), 10)).toHaveLength(0);
  });

  it("reschedules a message to a future time, reclaiming it only once due", async () => {
    await store.enqueue({ type: "test.c", payload: {} });
    const [msg] = await store.claimDue(soon(), 10);
    if (!msg) throw new Error("expected a claimed message");

    await store.reschedule(msg.id, new Date(Date.now() + 3_600_000), "smtp down");

    expect(await store.claimDue(soon(), 10)).toHaveLength(0); // not yet due
    const later = await store.claimDue(new Date(Date.now() + 7_200_000), 10);
    expect(later).toHaveLength(1);
    expect(later[0]?.attempts).toBe(2); // claim #2
    expect(later[0]?.lastError).toBe("smtp down");
  });

  it("dead-letters a message, keeping the error and never re-claiming it", async () => {
    await store.enqueue({ type: "test.d", payload: { token: "z" } });
    const [msg] = await store.claimDue(soon(), 10);
    if (!msg) throw new Error("expected a claimed message");

    await store.markDead(msg.id, new Date(), "gave up");

    const row = await prisma.outboxMessage.findUnique({ where: { id: msg.id } });
    expect(row?.status).toBe("dead");
    expect(row?.lastError).toBe("gave up");
    expect(row?.payload).toEqual({});
    expect(await store.claimDue(soon(3_600_000), 10)).toHaveLength(0);
  });

  it("respects the claim limit, leaving the rest for the next claim", async () => {
    await store.enqueue({ type: "test.e", payload: { n: 1 } });
    await store.enqueue({ type: "test.e", payload: { n: 2 } });
    await store.enqueue({ type: "test.e", payload: { n: 3 } });

    expect(await store.claimDue(soon(), 2)).toHaveLength(2);
    expect(await store.claimDue(soon(), 2)).toHaveLength(1); // 2 claimed are hidden
  });
});
