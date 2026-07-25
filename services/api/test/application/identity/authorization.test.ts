import { describe, expect, it } from "vitest";
import {
  PERMISSIONS,
  ROLE_PERMISSIONS,
  permissionsForPrincipal,
  permissionsForRoles,
  principalHasPermission,
} from "../../../src/application/identity/authorization.js";
import type { Principal } from "../../../src/application/identity/ports.js";

const officer = (roles?: readonly string[]): Principal => ({
  kind: "officer",
  officerId: "officer-1",
  ...(roles !== undefined ? { roles } : {}),
});
const investor: Principal = { kind: "investor", investorId: "inv-1" };

describe("authorization", () => {
  it("gives_investors_only_the_portal_permission", () => {
    expect(permissionsForPrincipal(investor)).toEqual(new Set([PERMISSIONS.INVESTOR_PORTAL]));
    expect(principalHasPermission(investor, PERMISSIONS.INVESTOR_PORTAL)).toBe(true);
    expect(principalHasPermission(investor, PERMISSIONS.LEDGER_CREDIT)).toBe(false);
  });

  it("falls_back_to_full_operator_for_a_legacy_staff_token_without_roles", () => {
    // Behaviour-preserving: tokens minted before 1.4c carry no roles.
    expect(principalHasPermission(officer(), PERMISSIONS.LEDGER_CREDIT)).toBe(true);
    expect(principalHasPermission(officer(), PERMISSIONS.APPROVAL_DECIDE)).toBe(true);
    expect(principalHasPermission(officer(), PERMISSIONS.KYC_REVIEW)).toBe(true);
    expect(principalHasPermission(officer(), PERMISSIONS.INVESTOR_PORTAL)).toBe(false);
  });

  it("grants_exactly_the_permissions_of_an_explicit_role_set", () => {
    // Treasury is a maker (credit) but not a checker (approve).
    const treasury = officer(["treasury"]);
    expect(principalHasPermission(treasury, PERMISSIONS.LEDGER_CREDIT)).toBe(true);
    expect(principalHasPermission(treasury, PERMISSIONS.APPROVAL_DECIDE)).toBe(false);
    expect(principalHasPermission(treasury, PERMISSIONS.KYC_REVIEW)).toBe(false);

    // Approver is a checker but cannot initiate a credit.
    const approver = officer(["approver"]);
    expect(principalHasPermission(approver, PERMISSIONS.APPROVAL_DECIDE)).toBe(true);
    expect(principalHasPermission(approver, PERMISSIONS.LEDGER_CREDIT)).toBe(false);
  });

  it("unions_permissions_across_multiple_roles", () => {
    const both = officer(["treasury", "approver"]);
    expect(principalHasPermission(both, PERMISSIONS.LEDGER_CREDIT)).toBe(true);
    expect(principalHasPermission(both, PERMISSIONS.APPROVAL_DECIDE)).toBe(true);
  });

  it("ignores_unknown_role_names", () => {
    expect(permissionsForRoles(["not-a-role"])).toEqual(new Set());
    const mixed = officer(["treasury", "bogus"]);
    expect(principalHasPermission(mixed, PERMISSIONS.LEDGER_CREDIT)).toBe(true);
  });

  it("super_admin_and_platform_operator_hold_every_staff_permission", () => {
    for (const role of ["super_admin", "platform_operator"] as const) {
      const perms = ROLE_PERMISSIONS[role];
      for (const perm of [
        PERMISSIONS.KYC_REVIEW,
        PERMISSIONS.LEDGER_CREDIT,
        PERMISSIONS.APPROVAL_DECIDE,
        PERMISSIONS.ASSET_MANAGE,
        PERMISSIONS.MFA_SELF,
      ]) {
        expect(perms.has(perm)).toBe(true);
      }
    }
  });

  // The authoritative role → permission matrix (1.4c/d). Each role's exact set is
  // pinned so a change to a role's privileges is a deliberate, reviewed edit.
  it("pins_the_exact_permission_set_of_each_role", () => {
    const P = PERMISSIONS;
    const allStaff = new Set([
      P.KYC_REVIEW,
      P.INVESTOR_READ,
      P.ASSET_MANAGE,
      P.OFFERING_MANAGE,
      P.DISTRIBUTION_MANAGE,
      P.REDEMPTION_MANAGE,
      P.LEDGER_CREDIT,
      P.ATTESTATION_PUBLISH,
      P.REGISTRY_READ,
      P.AUDIT_READ,
      P.CRM_MANAGE,
      P.REPORTING_READ,
      P.APPROVAL_DECIDE,
      P.MFA_SELF,
    ]);
    const matrix: Record<string, Set<string>> = {
      super_admin: allStaff,
      platform_operator: allStaff,
      compliance_analyst: new Set([
        P.KYC_REVIEW,
        P.INVESTOR_READ,
        P.CRM_MANAGE,
        P.REGISTRY_READ,
        P.REPORTING_READ,
        P.AUDIT_READ,
        P.MFA_SELF,
      ]),
      treasury: new Set([
        P.LEDGER_CREDIT,
        P.REDEMPTION_MANAGE,
        P.DISTRIBUTION_MANAGE,
        P.REPORTING_READ,
        P.MFA_SELF,
      ]),
      approver: new Set([P.APPROVAL_DECIDE, P.REPORTING_READ, P.MFA_SELF]),
      auditor: new Set([
        P.INVESTOR_READ,
        P.REGISTRY_READ,
        P.AUDIT_READ,
        P.REPORTING_READ,
        P.MFA_SELF,
      ]),
      investor: new Set([P.INVESTOR_PORTAL]),
    };
    for (const [role, expected] of Object.entries(matrix)) {
      expect(ROLE_PERMISSIONS[role as keyof typeof ROLE_PERMISSIONS]).toEqual(expected);
    }
    // Separation of duties: maker (treasury) and checker (approver) are disjoint
    // on the money-approval axis.
    expect(matrix.treasury?.has(P.APPROVAL_DECIDE)).toBe(false);
    expect(matrix.approver?.has(P.LEDGER_CREDIT)).toBe(false);
  });
});
