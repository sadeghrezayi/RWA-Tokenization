import { describe, expect, it } from "vitest";
import { visibleGroups } from "../lib/nav-visibility";
import type { NavGroupDef } from "../lib/nav-visibility";
import { PERMISSIONS } from "../lib/api";

const groups: NavGroupDef[] = [
  {
    label: "Main",
    items: [
      { href: "/overview", label: "Overview", icon: "o", permission: PERMISSIONS.REPORTING_READ },
    ],
  },
  {
    label: "Investors",
    items: [
      { href: "/kyc", label: "KYC", icon: "k", permission: PERMISSIONS.KYC_REVIEW },
      { href: "/investors", label: "Investors", icon: "i", permission: PERMISSIONS.INVESTOR_READ },
    ],
  },
  {
    label: "Assets",
    items: [
      {
        href: "/offerings",
        label: "Offerings",
        icon: "f",
        permission: PERMISSIONS.OFFERING_MANAGE,
      },
      {
        href: "/distributions",
        label: "Distributions",
        icon: "d",
        permission: PERMISSIONS.DISTRIBUTION_MANAGE,
      },
    ],
  },
  {
    label: "Account",
    items: [
      {
        href: "/approvals",
        label: "Approvals",
        icon: "a",
        permission: PERMISSIONS.APPROVAL_DECIDE,
      },
      { href: "/security", label: "Security", icon: "s", permission: PERMISSIONS.MFA_SELF },
    ],
  },
];

const names = (gs: NavGroupDef[]) => gs.flatMap((g) => g.items.map((i) => i.label));

describe("visibleGroups", () => {
  it("shows_everything_to_a_super_admin", () => {
    const all = Object.values(PERMISSIONS);
    expect(names(visibleGroups(groups, all))).toEqual([
      "Overview",
      "KYC",
      "Investors",
      "Offerings",
      "Distributions",
      "Approvals",
      "Security",
    ]);
  });

  it("hides_items_and_empty_groups_for_a_treasury_user", () => {
    // treasury: distribution.manage + reporting.read + mfa.self (no kyc/investor/
    // offering.manage/approval.decide).
    const treasury = [
      PERMISSIONS.DISTRIBUTION_MANAGE,
      PERMISSIONS.REPORTING_READ,
      PERMISSIONS.MFA_SELF,
    ];
    const visible = visibleGroups(groups, treasury);
    expect(names(visible)).toEqual(["Overview", "Distributions", "Security"]);
    // The Investors group is entirely gone (no items survived).
    expect(visible.some((g) => g.label === "Investors")).toBe(false);
  });

  it("keeps_items_that_declare_no_permission", () => {
    const gs: NavGroupDef[] = [{ label: "G", items: [{ href: "/x", label: "X", icon: "x" }] }];
    expect(names(visibleGroups(gs, []))).toEqual(["X"]);
  });
});
