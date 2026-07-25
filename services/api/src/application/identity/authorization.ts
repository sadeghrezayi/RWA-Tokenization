import type { Principal } from "./ports.js";

// RBAC substrate (T1/T3/T16). Permissions are the enforcement primitive; roles
// are named bundles of them, granted to a staff user via Membership (1.4c). An
// endpoint requires a permission; a principal may proceed only if one of its
// roles grants it. Deny-by-default.
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
  APPROVAL_DECIDE: "approval.decide",
  MFA_SELF: "mfa.self",
  INVESTOR_PORTAL: "investor.portal",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

// The staff role set (plus `investor`). `platform_operator` is the composite
// (all staff permissions) used by the bootstrapped super-admin and by legacy
// tokens; the others are the least-privilege staff roles for real separation
// of duties (maker vs checker, analyst, auditor).
export type RoleName =
  | "super_admin"
  | "platform_operator"
  | "compliance_analyst"
  | "treasury"
  | "approver"
  | "auditor"
  | "investor";

export const STAFF_ROLES: readonly RoleName[] = [
  "super_admin",
  "platform_operator",
  "compliance_analyst",
  "treasury",
  "approver",
  "auditor",
];

// Every staff role can manage its own MFA.
const ALL_STAFF_PERMISSIONS: readonly Permission[] = [
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
  PERMISSIONS.APPROVAL_DECIDE,
  PERMISSIONS.MFA_SELF,
];

export const ROLE_PERMISSIONS: Record<RoleName, ReadonlySet<Permission>> = {
  super_admin: new Set(ALL_STAFF_PERMISSIONS),
  platform_operator: new Set(ALL_STAFF_PERMISSIONS),
  compliance_analyst: new Set([
    PERMISSIONS.KYC_REVIEW,
    PERMISSIONS.INVESTOR_READ,
    PERMISSIONS.CRM_MANAGE,
    PERMISSIONS.REGISTRY_READ,
    PERMISSIONS.REPORTING_READ,
    PERMISSIONS.AUDIT_READ,
    PERMISSIONS.MFA_SELF,
  ]),
  // Maker for money movements — can request a credit but not approve it.
  treasury: new Set([
    PERMISSIONS.LEDGER_CREDIT,
    PERMISSIONS.REDEMPTION_MANAGE,
    PERMISSIONS.DISTRIBUTION_MANAGE,
    PERMISSIONS.REPORTING_READ,
    PERMISSIONS.MFA_SELF,
  ]),
  // Checker — can approve/reject in the maker-checker queue, but is not a maker.
  approver: new Set([
    PERMISSIONS.APPROVAL_DECIDE,
    PERMISSIONS.REPORTING_READ,
    PERMISSIONS.MFA_SELF,
  ]),
  auditor: new Set([
    PERMISSIONS.INVESTOR_READ,
    PERMISSIONS.REGISTRY_READ,
    PERMISSIONS.AUDIT_READ,
    PERMISSIONS.REPORTING_READ,
    PERMISSIONS.MFA_SELF,
  ]),
  investor: new Set([PERMISSIONS.INVESTOR_PORTAL]),
};

export const isRoleName = (value: string): value is RoleName =>
  Object.prototype.hasOwnProperty.call(ROLE_PERMISSIONS, value);

// Union of the permissions granted by a set of roles (unknown role names are
// ignored, so a stale token can never widen access).
export const permissionsForRoles = (roles: readonly string[]): ReadonlySet<Permission> => {
  const granted = new Set<Permission>();
  for (const role of roles) {
    if (isRoleName(role)) {
      for (const permission of ROLE_PERMISSIONS[role]) {
        granted.add(permission);
      }
    }
  }
  return granted;
};

export const permissionsForPrincipal = (principal: Principal): ReadonlySet<Permission> => {
  if (principal.kind === "investor") {
    return ROLE_PERMISSIONS.investor;
  }
  // Staff token with explicit roles → exactly those roles' permissions.
  if (principal.roles !== undefined && principal.roles.length > 0) {
    return permissionsForRoles(principal.roles);
  }
  // Legacy staff token (minted before 1.4c carried roles) → full operator.
  return ROLE_PERMISSIONS.platform_operator;
};

export const principalHasPermission = (principal: Principal, permission: Permission): boolean =>
  permissionsForPrincipal(principal).has(permission);
