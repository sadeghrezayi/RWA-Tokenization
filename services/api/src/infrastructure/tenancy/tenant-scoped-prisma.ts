import type { PrismaClient } from "@prisma/client";
import { TenantContext } from "./tenant-context.js";

// OD-1a enforcement (threat T15): every model operation on a tenant-owned
// table is transparently scoped to the TenantContext tenant.
//
// Implementation note: this is a Proxy, not a Prisma `$extends` query
// extension, on purpose — Prisma dispatches query-extension callbacks through
// an internal batching queue that loses AsyncLocalStorage context. The proxy
// captures the tenant SYNCHRONOUSLY in the caller's frame (where the context
// is guaranteed present) before delegating to the real client.
//
// Fail-closed rules:
//  - no TenantContext => MissingTenantContextError (from requireTenantId)
//  - operations whose unique-input shape cannot be tenant-scoped
//    (findUnique/update/upsert/delete) are forbidden — repositories use
//    findFirst/updateMany/deleteMany plus explicit create instead
//  - unknown operations on scoped models are rejected rather than passed
//
// Included child relations of an already-scoped row share its tenant by
// construction (creates stamp tenantId); repositories use no raw SQL. Both
// facts are exercised by the tenant-isolation integration suite.
export class TenantScopeViolationError extends Error {
  constructor(model: string, operation: string) {
    super(
      `${operation} on ${model} is not tenant-safe — use findFirst/updateMany/deleteMany/create`,
    );
  }
}

// Platform-level models that are not tenant-owned.
const UNSCOPED_MODELS = new Set(["tenant", "loginAttempt"]);

const WHERE_SCOPED = new Set([
  "findMany",
  "findFirst",
  "findFirstOrThrow",
  "count",
  "aggregate",
  "groupBy",
  "updateMany",
  "updateManyAndReturn",
  "deleteMany",
]);
const CREATE_SINGLE = new Set(["create"]);
const CREATE_MANY = new Set(["createMany", "createManyAndReturn"]);
const FORBIDDEN = new Set(["findUnique", "findUniqueOrThrow", "update", "upsert", "delete"]);

type AnyArgs = { where?: Record<string, unknown>; data?: unknown } & Record<string, unknown>;
type ModelDelegate = Record<string, unknown> & { findMany: (...a: unknown[]) => unknown };
type ClientLike = Record<string | symbol, unknown>;

const isModelDelegate = (value: unknown): value is ModelDelegate =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as Record<string, unknown>).findMany === "function";

const scopeArgs = (model: string, operation: string, args: AnyArgs | undefined): AnyArgs => {
  const tenantId = TenantContext.requireTenantId();
  const base: AnyArgs = { ...(args ?? {}) };
  if (WHERE_SCOPED.has(operation)) {
    base.where = { AND: [base.where ?? {}, { tenantId }] };
    return base;
  }
  if (CREATE_SINGLE.has(operation)) {
    base.data = { ...(base.data as Record<string, unknown>), tenantId };
    return base;
  }
  if (CREATE_MANY.has(operation)) {
    const data = base.data;
    base.data = Array.isArray(data)
      ? data.map((row) => ({ ...(row as Record<string, unknown>), tenantId }))
      : { ...(data as Record<string, unknown>), tenantId };
    return base;
  }
  throw new TenantScopeViolationError(model, operation);
};

const wrapDelegate = (model: string, delegate: ModelDelegate): ModelDelegate =>
  new Proxy(delegate, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver) as unknown;
      if (typeof prop !== "string" || typeof value !== "function") {
        return value;
      }
      if (FORBIDDEN.has(prop)) {
        return () => {
          throw new TenantScopeViolationError(model, prop);
        };
      }
      const fn = value as (...a: unknown[]) => unknown;
      return (...callArgs: unknown[]) => {
        const scoped = scopeArgs(model, prop, callArgs[0] as AnyArgs | undefined);
        return fn.call(target, scoped, ...callArgs.slice(1));
      };
    },
  });

const wrapClient = <T extends object>(client: T): T =>
  new Proxy(client, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver) as unknown;
      if (typeof prop !== "string") {
        return value;
      }
      if (prop === "$transaction") {
        const tx = value as (...a: unknown[]) => unknown;
        return (first: unknown, ...rest: unknown[]) => {
          if (typeof first === "function") {
            const callback = first as (c: unknown) => unknown;
            return tx.call(target, (inner: object) => callback(wrapClient(inner)), ...rest);
          }
          // Array form: the promises were created through this proxy, so
          // their args are already scoped.
          return tx.call(target, first, ...rest);
        };
      }
      if (isModelDelegate(value)) {
        return UNSCOPED_MODELS.has(prop) ? value : wrapDelegate(prop, value);
      }
      if (typeof value === "function") {
        return (value as (...a: unknown[]) => unknown).bind(target);
      }
      return value;
    },
  });

export const tenantScopedPrisma = (client: PrismaClient): PrismaClient =>
  wrapClient(client as unknown as ClientLike) as unknown as PrismaClient;
