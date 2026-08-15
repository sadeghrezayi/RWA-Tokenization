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
import { PrismaIssuerRepository } from "../../src/infrastructure/persistence/prisma-issuer-repository.js";
import { IssuerMembership } from "../../src/domain/issuers/issuer-membership.js";
import { IssuerOrganisation } from "../../src/domain/issuers/issuer-organisation.js";
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

  // Cleanup keys on the "iso-" id prefix, NOT on tenant: a test that
  // deliberately mis-wires the scoped client writes rows under the DEFAULT
  // tenant, and a tenant-keyed cleanup leaves them behind to poison the next
  // run. Learned the hard way.
  const clearFixtures = async () => {
    await raw.issuerMembership.deleteMany({ where: { organisationId: { startsWith: "iso-" } } });
    await raw.issuerOrganisation.deleteMany({ where: { id: { startsWith: "iso-" } } });
    await raw.asset.deleteMany({ where: { id: { startsWith: "iso-" } } });
  };

  beforeEach(clearFixtures);

  afterAll(async () => {
    await clearFixtures();
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

  // 3.2: issuer organisations carry tenant_id like everything else, and the
  // repository must be isolated by the same construction — an organisation is
  // who may raise money here, so leaking one across tenants is severe.
  it("keeps_issuer_organisations_isolated_through_the_repository", async () => {
    const repo = new PrismaIssuerRepository(scoped);
    const organisation = IssuerOrganisation.apply({
      id: "iso-org-1",
      legalName: "A-owned Holdings",
      registrationNumber: "REG-A",
      contactEmail: "a@example.test",
      appliedAt: new Date("2026-08-01T00:00:00Z"),
    });

    await inTenant(A, () => repo.save(organisation));

    expect((await raw.issuerOrganisation.findFirst({ where: { id: "iso-org-1" } }))?.tenantId).toBe(
      A,
    );
    expect(await inTenant(B, () => repo.findById("iso-org-1"))).toBeUndefined();
    expect(await inTenant(B, () => repo.findAll())).toEqual([]);
    expect(await inTenant(A, () => repo.findAll())).toHaveLength(1);
  });

  it("keeps_issuer_memberships_isolated_through_the_repository", async () => {
    // Membership answers "which organisation is this user acting for?" — the
    // question asked on every issuer request, so it must never cross tenants.
    const repo = new PrismaIssuerRepository(scoped);
    await inTenant(A, () =>
      repo.save(
        IssuerOrganisation.apply({
          id: "iso-org-2",
          legalName: "A-owned Holdings",
          registrationNumber: "REG-A2",
          contactEmail: "a2@example.test",
          appliedAt: new Date("2026-08-01T00:00:00Z"),
        }),
      ),
    );
    await inTenant(A, () =>
      repo.addMember(
        IssuerMembership.of({
          organisationId: "iso-org-2",
          userId: "iso-user-1",
          role: "issuer_admin",
          addedAt: new Date("2026-08-01T00:00:00Z"),
        }),
      ),
    );

    expect(await inTenant(A, () => repo.membershipsFor("iso-user-1"))).toHaveLength(1);
    expect(await inTenant(B, () => repo.membershipsFor("iso-user-1"))).toEqual([]);
    expect(await inTenant(B, () => repo.membersOf("iso-org-2"))).toEqual([]);
  });
});
