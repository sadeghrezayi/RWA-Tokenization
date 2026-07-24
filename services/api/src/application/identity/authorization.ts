import type { Principal } from "./ports.js";

// RBAC substrate (T1/T3/T16). Permissions are the enforcement primitive; roles
// are named bundles of them. Deny-by-default: an endpoint requires a permission,
// and only principals whose role grants it may proceed.
//
// Today there are two coarse roles derived from the principal kind. The real
// User + Membership model (1.4c) will assign these same roles per user; the
// permission catalog below does not change when that lands.
export const PERMISSIONS = {
  KYC_REVIEW: "kyc.review",
  INVESTOR_READ: "investor.read",
  ASSET_MANAGE: "asset.manage",
  OFFERING_MANAGE: "offering.manage",
  DISTRIBUTION_MANAGE: "distribution.manage",
  REDEMPTION_MANAGE: "redemption.manage",
  LEDGER_CREDIT: "ledger.credit",
  ATTESTATION_PUBLISH: "attestation.publish",
  REGISTRY_READ: "registry.read",
  AUDIT_READ: "audit.read",
  CRM_MANAGE: "crm.manage",
  REPORTING_READ: "reporting.read",
  MFA_SELF: "mfa.self",
  INVESTOR_PORTAL: "investor.portal",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export type RoleName = "platform_operator" | "investor";

// The composite operator holds every staff permission — this is what keeps the
// migration behaviour-preserving while the single env officer still exists.
// Distinct roles (analyst, treasury, transfer-agent, …) are split out in 1.4c.
const OPERATOR_PERMISSIONS: readonly Permission[] = [
  PERMISSIONS.KYC_REVIEW,
  PERMISSIONS.INVESTOR_READ,
  PERMISSIONS.ASSET_MANAGE,
  PERMISSIONS.OFFERING_MANAGE,
  PERMISSIONS.DISTRIBUTION_MANAGE,
  PERMISSIONS.REDEMPTION_MANAGE,
  PERMISSIONS.LEDGER_CREDIT,
  PERMISSIONS.ATTESTATION_PUBLISH,
  PERMISSIONS.REGISTRY_READ,
  PERMISSIONS.AUDIT_READ,
  PERMISSIONS.CRM_MANAGE,
  PERMISSIONS.REPORTING_READ,
  PERMISSIONS.MFA_SELF,
];

const INVESTOR_PERMISSIONS: readonly Permission[] = [PERMISSIONS.INVESTOR_PORTAL];

export const ROLE_PERMISSIONS: Record<RoleName, ReadonlySet<Permission>> = {
  platform_operator: new Set(OPERATOR_PERMISSIONS),
  investor: new Set(INVESTOR_PERMISSIONS),
};

export const roleForPrincipal = (principal: Principal): RoleName =>
  principal.kind === "officer" ? "platform_operator" : "investor";

export const permissionsForPrincipal = (principal: Principal): ReadonlySet<Permission> =>
  ROLE_PERMISSIONS[roleForPrincipal(principal)];

export const principalHasPermission = (principal: Principal, permission: Permission): boolean =>
  permissionsForPrincipal(principal).has(permission);
