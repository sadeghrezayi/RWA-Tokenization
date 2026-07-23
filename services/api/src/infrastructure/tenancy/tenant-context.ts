import { AsyncLocalStorage } from "node:async_hooks";

// OD-1a tenant-ready foundation: request-scoped tenant propagation via
// AsyncLocalStorage. Fail-closed — code touching tenant-scoped data outside an
// explicit scope throws (threat T15), it never silently defaults.
export const DEFAULT_TENANT_ID = "default";

export class MissingTenantContextError extends Error {
  constructor() {
    super("no tenant context — wrap the operation in TenantContext.run(tenantId, …)");
  }
}

const storage = new AsyncLocalStorage<{ tenantId: string }>();

export const TenantContext = {
  run<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
    return storage.run({ tenantId }, fn);
  },

  requireTenantId(): string {
    const store = storage.getStore();
    if (!store) {
      throw new MissingTenantContextError();
    }
    return store.tenantId;
  },
};
