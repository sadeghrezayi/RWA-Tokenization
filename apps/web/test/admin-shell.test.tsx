import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// next/navigation + next/link are mocked so the shell can be unit-tested.
let mockPathname = "/en/admin/overview";
vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

// The shell gates on the httpOnly cookie session, checked via getSession().
const getSession = vi.fn();
const officerLogin = vi.fn();
const logout = vi.fn().mockResolvedValue(undefined);
vi.mock("../lib/api", async (orig) => {
  const actual = await orig<typeof import("../lib/api")>();
  return { ...actual, createApiClient: () => ({ getSession, officerLogin, logout }) };
});

import { AdminShell } from "../components/admin/admin-shell";

const SessionProbe = () => <div data-testid="probe">section content</div>;

const asOfficer = () => getSession.mockResolvedValue({ kind: "officer" });
const asAnon = () => getSession.mockRejectedValue(new Error("401"));

describe("AdminShell", () => {
  beforeEach(() => {
    mockPathname = "/en/admin/overview";
    getSession.mockReset();
    officerLogin.mockReset();
    logout.mockClear();
  });

  it("shows_the_officer_login_when_there_is_no_session", async () => {
    asAnon();
    render(
      <AdminShell locale="en">
        <SessionProbe />
      </AdminShell>,
    );

    expect(await screen.findByText("Compliance Review")).toBeInTheDocument();
    expect(screen.queryByTestId("probe")).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });

  it("shows_the_login_when_a_non_officer_session_is_present", async () => {
    getSession.mockResolvedValue({ kind: "investor" });
    render(
      <AdminShell locale="en">
        <SessionProbe />
      </AdminShell>,
    );
    expect(await screen.findByText("Compliance Review")).toBeInTheDocument();
    expect(screen.queryByTestId("probe")).not.toBeInTheDocument();
  });

  it("renders_the_sidebar_and_children_for_an_officer_session", async () => {
    asOfficer();
    render(
      <AdminShell locale="en">
        <SessionProbe />
      </AdminShell>,
    );

    expect(await screen.findByTestId("probe")).toBeInTheDocument();
    const nav = screen.getByRole("navigation", { name: "admin navigation" });
    for (const label of [
      "Overview",
      "Investors",
      "Asset Onboarding",
      "Holder Registry",
      "Audit Log",
    ]) {
      expect(nav).toHaveTextContent(label);
    }
  });

  it("marks_the_active_section_from_the_pathname", async () => {
    asOfficer();
    mockPathname = "/en/admin/investors";
    render(
      <AdminShell locale="en">
        <SessionProbe />
      </AdminShell>,
    );

    const active = await screen.findByRole("link", { current: "page" });
    expect(active).toHaveTextContent("Investors");
    expect(active).toHaveAttribute("href", "/en/admin/investors");
  });

  it("keeps_the_detail_route_active_under_its_section", async () => {
    asOfficer();
    mockPathname = "/en/admin/investors/abc-123";
    render(
      <AdminShell locale="en">
        <SessionProbe />
      </AdminShell>,
    );

    const active = await screen.findByRole("link", { current: "page" });
    expect(active).toHaveTextContent("Investors");
  });

  it("logs_out_via_the_api_and_returns_to_the_login", async () => {
    asOfficer();
    render(
      <AdminShell locale="en">
        <SessionProbe />
      </AdminShell>,
    );
    await screen.findByTestId("probe");

    await userEvent.click(screen.getByRole("button", { name: /Log out/ }));

    await waitFor(() => {
      expect(screen.queryByTestId("probe")).not.toBeInTheDocument();
    });
    expect(logout).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Compliance Review")).toBeInTheDocument();
  });
});
