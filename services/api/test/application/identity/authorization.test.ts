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
});
