import { DEFAULT_TENANT_ID, TenantContext } from "./tenant-context.js";

// Every HTTP request runs inside a tenant scope. Single-tenant install
// (OD-1a): the scope is always the default tenant; once authentication
// carries memberships (Phase 1.3/1.4) resolution moves behind the auth layer.
// next() is invoked synchronously inside the ALS frame so the entire
// downstream handler chain inherits the scope.
export const tenantMiddleware = (_req: unknown, _res: unknown, next: () => void): void => {
  void TenantContext.run(DEFAULT_TENANT_ID, () => {
    next();
    return Promise.resolve();
  });
};
