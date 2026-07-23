import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  MissingTenantContextError,
  TenantContext,
} from "../../src/infrastructure/tenancy/tenant-context.js";
import {
  TenantScopeViolationError,
  tenantScopedPrisma,
} from "../../src/infrastructure/tenancy/tenant-scoped-prisma.js";
import { PrismaAssetRepository } from "../../src/infrastructure/persistence/prisma-asset-repository.js";
import { Asset } from "../../src/domain/assets/asset.js";
import { LegalDossier } from "../../src/domain/assets/legal-dossier.js";
import { OnboardingChecklist } from "../../src/domain/assets/onboarding-checklist.js";

// OD-1a / threat T15: cross-tenant access must be impossible by construction.
// The raw client (test fixture) is unscoped; the scoped client is what the
// composition root wires into every repository.
const raw = new PrismaClient();
const scoped = tenantScopedPrisma(raw);
const A = "iso-a";
const B = "iso-b";
const inTenant = <T>(tenant: string, fn: () => Promise<T>) => TenantContext.run(tenant, fn);

describe("Tenant isolation (integration, real Postgres)", () => {
  beforeAll(async () => {
    await raw.tenant.createMany({
      data: [
        { id: A, name: "Isolation A" },
        { id: B, name: "Isolation B" },
      ],
      skipDuplicates: true,
    });
  });

  beforeEach(async () => {
    await raw.asset.deleteMany({ where: { tenantId: { in: [A, B] } } });
  });

  afterAll(async () => {
    await raw.asset.deleteMany({ where: { tenantId: { in: [A, B] } } });
    await raw.tenant.deleteMany({ where: { id: { in: [A, B] } } });
    await raw.$disconnect();
  });

  it("fails_closed_without_a_tenant_context", () => {
    // Enforcement happens synchronously at invocation, in the caller's frame.
    expect(() => scoped.asset.findMany()).toThrow(MissingTenantContextError);
    expect(() =>
      scoped.asset.create({ data: { id: "iso-x", name: "x", type: "t", state: "proposed" } }),
    ).toThrow(MissingTenantContextError);
  });

  it("rejects_tenant_unsafe_operations_even_inside_a_scope", async () => {
    await inTenant(A, () => {
      expect(() => scoped.asset.findUnique({ where: { id: "iso-x" } })).toThrow(
        TenantScopeViolationError,
      );
      expect(() =>
        scoped.asset.upsert({
          where: { id: "iso-x" },
          create: { id: "iso-x", name: "x", type: "t", state: "proposed" },
          update: { name: "y" },
        }),
      ).toThrow(TenantScopeViolationError);
      expect(() => scoped.asset.delete({ where: { id: "iso-x" } })).toThrow(
        TenantScopeViolationError,
      );
      return Promise.resolve();
    });
  });

  it("stamps_creates_with_the_scope_tenant_and_hides_them_from_others", async () => {
    await inTenant(A, async () => {
      await scoped.asset.create({
        data: { id: "iso-asset-1", name: "A-owned", type: "asset_backed", state: "proposed" },
      });
    });

    const rowA = await raw.asset.findFirst({ where: { id: "iso-asset-1" } });
    expect(rowA?.tenantId).toBe(A);

    expect(await inTenant(B, () => scoped.asset.findMany())).toEqual([]);
    expect(
      await inTenant(B, () => scoped.asset.findFirst({ where: { id: "iso-asset-1" } })),
    ).toBeNull();
    expect(await inTenant(A, () => scoped.asset.count())).toBe(1);
  });

  it("makes_cross_tenant_mutation_a_noop", async () => {
    await inTenant(A, () =>
      scoped.asset.create({
        data: { id: "iso-asset-2", name: "A-owned", type: "asset_backed", state: "proposed" },
      }),
    );

    const updated = await inTenant(B, () =>
      scoped.asset.updateMany({ where: { id: "iso-asset-2" }, data: { name: "stolen" } }),
    );
    const deleted = await inTenant(B, () =>
      scoped.asset.deleteMany({ where: { id: "iso-asset-2" } }),
    );
    expect(updated.count).toBe(0);
    expect(deleted.count).toBe(0);
    expect((await raw.asset.findFirst({ where: { id: "iso-asset-2" } }))?.name).toBe("A-owned");
  });

  it("keeps_repositories_isolated_when_wired_through_the_scoped_client", async () => {
    const repo = new PrismaAssetRepository(scoped);
    const asset = Asset.restore({
      id: "iso-asset-3",
      name: "Repo Asset",
      type: "asset_backed",
      state: "proposed",
      dossier: LegalDossier.empty(),
      checklist: OnboardingChecklist.empty(),
      custody: undefined,
    });

    await inTenant(A, () => repo.save(asset));
    await inTenant(A, () => repo.save(asset)); // idempotent second save (update path)

    expect(await inTenant(B, () => repo.findById("iso-asset-3"))).toBeUndefined();
    expect((await inTenant(B, () => repo.findAll())).map((a) => a.id)).toEqual([]);
    expect((await inTenant(A, () => repo.findById("iso-asset-3")))?.name).toBe("Repo Asset");
  });

  it("leaves_the_tenant_model_itself_unscoped", async () => {
    const tenants = await scoped.tenant.findMany({ where: { id: { in: [A, B] } } });
    expect(tenants).toHaveLength(2);
  });
});
