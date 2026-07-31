import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { AesGcmCipher } from "../../src/infrastructure/crypto/aes-gcm-cipher.js";
import { PrismaEvidenceStore } from "../../src/infrastructure/persistence/prisma-evidence-store.js";
import { TenantContext } from "../../src/infrastructure/tenancy/tenant-context.js";
import { tenantScopedPrisma } from "../../src/infrastructure/tenancy/tenant-scoped-prisma.js";
import { flipByte } from "../fakes/bytes.js";

// 2.3b: the private, encrypted-at-rest evidence store against real Postgres.
//
// The recorded decision is that identity documents are NOT put on IPFS. Two
// properties make that decision real, and both are asserted here against the
// actual row: the stored bytes are ciphertext, and erase() genuinely removes
// the document.
const prisma = new PrismaClient();
const key = randomBytes(32);
const clock = { now: () => new Date("2026-07-31T12:00:00Z") };
const store = new PrismaEvidenceStore(prisma, new AesGcmCipher(key), clock);

const passport = Buffer.from("PASSPORT-SCAN-JPEG-BYTES-national-id-1234567890", "utf8");

const putInput = (): Parameters<PrismaEvidenceStore["put"]>[0] => ({
  investorId: "inv-1",
  step: "identity_evidence",
  filename: "passport.jpg",
  contentType: "image/jpeg",
  bytes: passport,
});

const put = (overrides: Partial<Parameters<PrismaEvidenceStore["put"]>[0]> = {}) =>
  store.put({ ...putInput(), ...overrides });

beforeEach(async () => {
  await prisma.kycEvidence.deleteMany({});
});

afterAll(async () => {
  await prisma.kycEvidence.deleteMany({});
  await prisma.$disconnect();
});

describe("PrismaEvidenceStore (integration, real Postgres)", () => {
  it("stores a document and describes it without exposing its content", async () => {
    const descriptor = await put();

    expect(descriptor.reference).not.toBe("");
    expect(descriptor.investorId).toBe("inv-1");
    expect(descriptor.step).toBe("identity_evidence");
    expect(descriptor.filename).toBe("passport.jpg");
    expect(descriptor.contentType).toBe("image/jpeg");
    // The size an applicant recognizes is the size of their file, not the
    // sealed blob's.
    expect(descriptor.byteSize).toBe(passport.length);
    expect(descriptor.uploadedAt).toEqual(clock.now());
    expect(descriptor).not.toHaveProperty("bytes");
  });

  it("writes ciphertext to the database, never the document itself", async () => {
    const { reference } = await put();

    const row = await prisma.kycEvidence.findUnique({ where: { reference } });
    if (!row) throw new Error("expected a stored row");

    const stored = Buffer.from(row.content);
    expect(stored.equals(passport)).toBe(false);
    // Not merely different — the plaintext must not appear anywhere inside it.
    expect(stored.includes(passport)).toBe(false);
    expect(stored.toString("utf8")).not.toContain("PASSPORT");
    // iv + tag overhead proves the sealed layout, not a rename of the bytes.
    expect(stored.length).toBeGreaterThan(passport.length);
  });

  it("round-trips the exact bytes back to an entitled caller", async () => {
    const { reference } = await put();

    const fetched = await store.fetch(reference);
    expect(fetched?.bytes.equals(passport)).toBe(true);
    expect(fetched?.descriptor.filename).toBe("passport.jpg");
  });

  it("stores two identical documents as different bytes", async () => {
    // A fresh IV per document: two applicants uploading the same file must not
    // be linkable by comparing what is at rest.
    const a = await put();
    const b = await put({ investorId: "inv-2" });

    const rows = await prisma.kycEvidence.findMany({
      where: { reference: { in: [a.reference, b.reference] } },
    });
    expect(rows).toHaveLength(2);
    expect(Buffer.from(rows[0]?.content ?? []).equals(Buffer.from(rows[1]?.content ?? []))).toBe(
      false,
    );
  });

  it("lists one applicant's evidence as metadata only", async () => {
    await put();
    await put({ filename: "utility-bill.pdf", contentType: "application/pdf", step: "profile" });
    await put({ investorId: "inv-2", filename: "someone-else.jpg" });

    const listed = await store.listFor("inv-1");

    expect(listed.map((item) => item.filename).sort()).toEqual([
      "passport.jpg",
      "utility-bill.pdf",
    ]);
    // Listing a queue of applicants must not decrypt anybody's documents.
    for (const item of listed) {
      expect(item).not.toHaveProperty("bytes");
    }
  });

  it("reports an unknown reference as absent rather than failing", async () => {
    expect(await store.fetch("no-such-reference")).toBeUndefined();
  });

  it("erases a document and says whether anything was removed", async () => {
    const { reference } = await put();

    expect(await store.erase(reference)).toBe(true);
    expect(await store.fetch(reference)).toBeUndefined();
    expect(await prisma.kycEvidence.findUnique({ where: { reference } })).toBeNull();

    // Honest second answer: nothing was removed this time.
    expect(await store.erase(reference)).toBe(false);
  });

  it("refuses content that was altered in the database", async () => {
    const { reference } = await put();
    const row = await prisma.kycEvidence.findUnique({ where: { reference } });
    if (!row) throw new Error("expected a stored row");
    const stored = Buffer.from(row.content);
    const tampered = flipByte(stored, stored.length - 1);
    await prisma.kycEvidence.update({
      where: { reference },
      data: { content: new Uint8Array(tampered) },
    });

    // Authenticated encryption reaches all the way through the adapter: a
    // reviewer sees an error, never a silently corrupted document.
    await expect(store.fetch(reference)).rejects.toThrow();
  });

  it("cannot be read by a store holding a different key", async () => {
    const { reference } = await put();
    const other = new PrismaEvidenceStore(prisma, new AesGcmCipher(randomBytes(32)), clock);

    await expect(other.fetch(reference)).rejects.toThrow();
  });

  it("keeps one tenant's evidence invisible to another (threat T15)", async () => {
    // Identity documents are the most severe thing a cross-tenant leak could
    // expose, so the scoped client — what the composition root actually wires —
    // is exercised here rather than assumed from the generic isolation suite.
    const scoped = new PrismaEvidenceStore(
      tenantScopedPrisma(prisma),
      new AesGcmCipher(key),
      clock,
    );
    await prisma.tenant.createMany({
      data: [
        { id: "ev-a", name: "Evidence A" },
        { id: "ev-b", name: "Evidence B" },
      ],
      skipDuplicates: true,
    });

    try {
      const mine = await TenantContext.run("ev-a", () => scoped.put({ ...putInput() }));

      expect(await TenantContext.run("ev-a", () => scoped.listFor("inv-1"))).toHaveLength(1);
      expect(await TenantContext.run("ev-b", () => scoped.listFor("inv-1"))).toEqual([]);
      expect(await TenantContext.run("ev-b", () => scoped.fetch(mine.reference))).toBeUndefined();
      // Nor can the other tenant destroy evidence it cannot see.
      expect(await TenantContext.run("ev-b", () => scoped.erase(mine.reference))).toBe(false);
      expect(await TenantContext.run("ev-a", () => scoped.fetch(mine.reference))).toBeDefined();
    } finally {
      await prisma.kycEvidence.deleteMany({ where: { tenantId: { in: ["ev-a", "ev-b"] } } });
      await prisma.tenant.deleteMany({ where: { id: { in: ["ev-a", "ev-b"] } } });
    }
  });
});
