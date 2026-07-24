import { describe, expect, it } from "vitest";
import {
  PERMISSIONS,
  ROLE_PERMISSIONS,
  permissionsForPrincipal,
  principalHasPermission,
  roleForPrincipal,
} from "../../../src/application/identity/authorization.js";
import type { Principal } from "../../../src/application/identity/ports.js";

const officer: Principal = { kind: "officer", officerId: "officer-1" };
const investor: Principal = { kind: "investor", investorId: "inv-1" };

describe("authorization", () => {
  it("maps_the_env_officer_to_the_platform_operator_role", () => {
    expect(roleForPrincipal(officer)).toBe("platform_operator");
    expect(roleForPrincipal(investor)).toBe("investor");
  });

  it("grants_the_operator_every_current_officer_permission", () => {
    const operator = ROLE_PERMISSIONS.platform_operator;
    // Behaviour-preserving: the composite operator holds all staff permissions.
    for (const perm of [
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
    ]) {
      expect(operator.has(perm)).toBe(true);
    }
  });

  it("gives_investors_only_the_portal_permission", () => {
    expect(permissionsForPrincipal(investor)).toEqual(new Set([PERMISSIONS.INVESTOR_PORTAL]));
    expect(principalHasPermission(investor, PERMISSIONS.INVESTOR_PORTAL)).toBe(true);
    expect(principalHasPermission(investor, PERMISSIONS.LEDGER_CREDIT)).toBe(false);
  });

  it("denies_operators_the_investor_portal_and_vice_versa", () => {
    expect(principalHasPermission(officer, PERMISSIONS.INVESTOR_PORTAL)).toBe(false);
    expect(principalHasPermission(officer, PERMISSIONS.LEDGER_CREDIT)).toBe(true);
  });
});
