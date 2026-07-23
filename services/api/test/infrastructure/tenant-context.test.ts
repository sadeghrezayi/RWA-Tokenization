import { describe, expect, it } from "vitest";
import {
  DEFAULT_TENANT_ID,
  MissingTenantContextError,
  TenantContext,
} from "../../src/infrastructure/tenancy/tenant-context.js";

// OD-1a: single-tenant install on a tenant-ready foundation. The context is
// fail-closed: any data access outside an explicit tenant scope must throw,
// never silently default (threat T15).
describe("TenantContext", () => {
  it("exposes_the_tenant_inside_run", async () => {
    const seen = await TenantContext.run("tenant-a", () =>
      Promise.resolve(TenantContext.requireTenantId()),
    );
    expect(seen).toBe("tenant-a");
  });

  it("is_fail_closed_outside_any_scope", () => {
    expect(() => TenantContext.requireTenantId()).toThrow(MissingTenantContextError);
  });

  it("isolates_nested_and_concurrent_scopes", async () => {
    const results = await Promise.all([
      TenantContext.run("tenant-a", async () => {
        const inner = await TenantContext.run("tenant-b", () =>
          Promise.resolve(TenantContext.requireTenantId()),
        );
        return { inner, outer: TenantContext.requireTenantId() };
      }),
      TenantContext.run("tenant-c", () => Promise.resolve(TenantContext.requireTenantId())),
    ]);
    expect(results[0]).toEqual({ inner: "tenant-b", outer: "tenant-a" });
    expect(results[1]).toBe("tenant-c");
  });

  it("propagates_rejections_without_leaking_scope", async () => {
    await expect(
      TenantContext.run("tenant-a", () => Promise.reject(new Error("boom"))),
    ).rejects.toThrow("boom");
    expect(() => TenantContext.requireTenantId()).toThrow(MissingTenantContextError);
  });

  it("declares_the_default_tenant_constant", () => {
    expect(DEFAULT_TENANT_ID).toBe("default");
  });
});
