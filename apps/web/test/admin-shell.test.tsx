import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
// The top bar mounts the notification bell (1.7e), so the shell's client needs
// the notification reads too — quiet by default here.
const listNotifications = vi.fn().mockResolvedValue([]);
const unreadNotificationCount = vi.fn().mockResolvedValue(0);
vi.mock("../lib/api", async (orig) => {
  const actual = await orig<typeof import("../lib/api")>();
  return {
    ...actual,
    createApiClient: () => ({
      getSession,
      officerLogin,
      logout,
      listNotifications,
      unreadNotificationCount,
    }),
  };
});

import { AdminShell } from "../components/admin/admin-shell";
import { PERMISSIONS } from "../lib/api";

const SessionProbe = () => <div data-testid="probe">section content</div>;

// A super-admin session (all permissions) so every nav item renders.
const asOfficer = () =>
  getSession.mockResolvedValue({ kind: "officer", permissions: Object.values(PERMISSIONS) });
const asAnon = () => getSession.mockRejectedValue(new Error("401"));

const renderSignedIn = async (): Promise<void> => {
  asOfficer();
  render(
    <AdminShell locale="en">
      <SessionProbe />
    </AdminShell>,
  );
  await screen.findByTestId("probe");
};

describe("AdminShell", () => {
  it("names the ROLES the person is signed in with, not a hard-coded 'officer'", async () => {
    // Every staff member used to see "Signed in as officer" regardless of who
    // they were. With four distinct roles that is misleading: a checker cannot
    // tell whether they are maker or checker, and an auditor could believe
    // they hold operator powers.
    getSession.mockResolvedValue({
      kind: "officer",
      permissions: [PERMISSIONS.REPORTING_READ],
      roles: ["auditor"],
    });
    render(
      <AdminShell locale="en">
        <SessionProbe />
      </AdminShell>,
    );
    await screen.findByTestId("probe");

    expect((await screen.findByTestId("signed-in-as")).textContent).toMatch(/auditor/i);
  });

  it("falls back to a generic label when a legacy token carries no roles", async () => {
    // Tokens minted before roles existed still verify. Showing nothing, or an
    // empty space, would look broken; the generic word is honest about what is
    // known.
    getSession.mockResolvedValue({
      kind: "officer",
      permissions: [PERMISSIONS.REPORTING_READ],
    });
    render(
      <AdminShell locale="en">
        <SessionProbe />
      </AdminShell>,
    );
    await screen.findByTestId("probe");

    expect((await screen.findByTestId("signed-in-as")).textContent).toMatch(/officer/i);
  });

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

  // Regression (found in 1.7e live verification): logging in only flipped the
  // status, never loading the session's permissions — so a freshly signed-in
  // officer saw an EMPTY sidebar until they manually reloaded the page.
  it("loads_the_permissions_after_a_fresh_login_so_the_nav_is_not_empty", async () => {
    getSession.mockRejectedValueOnce(new Error("401")); // no session on mount
    render(
      <AdminShell locale="en">
        <SessionProbe />
      </AdminShell>,
    );
    await screen.findByText("Compliance Review");

    // The login succeeds and the session now resolves with permissions.
    officerLogin.mockResolvedValue({ csrfToken: "csrf" });
    asOfficer();
    await userEvent.type(screen.getByLabelText("Email"), "officer@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "officer-pass");
    await userEvent.click(screen.getByRole("button", { name: "Log in" }));

    expect(await screen.findByRole("link", { name: /Overview/ })).toBeInTheDocument();
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

  it("collapses the navigation behind a menu button, closed to begin with", async () => {
    // Twelve nav items wrapped across a phone screen pushed the actual page
    // below the fold. On small screens the nav is disclosed on demand; the
    // button is hidden by CSS at desktop widths, where the nav is always shown.
    await renderSignedIn();

    const toggle = await screen.findByRole("button", { name: /menu/i });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(document.querySelector(".sidebar__nav--open")).toBeNull();
  });

  it("opens and closes the navigation from that button", async () => {
    await renderSignedIn();
    const toggle = await screen.findByRole("button", { name: /menu/i });

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(document.querySelector(".sidebar__nav--open")).not.toBeNull();

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
  });

  it("closes the menu once a destination is chosen", async () => {
    // Leaving it open would cover the page the officer just navigated to.
    await renderSignedIn();
    const toggle = await screen.findByRole("button", { name: /menu/i });
    fireEvent.click(toggle);

    fireEvent.click(screen.getByRole("link", { name: /Investors/ }));

    expect(toggle.getAttribute("aria-expanded")).toBe("false");
  });
});
