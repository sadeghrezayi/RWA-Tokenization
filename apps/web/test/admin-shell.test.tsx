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

const officerLogin = vi.fn().mockResolvedValue({ token: "officer-tok" });
vi.mock("../lib/api", async (orig) => {
  const actual = await orig<typeof import("../lib/api")>();
  return { ...actual, createApiClient: () => ({ officerLogin }) };
});

import { AdminShell } from "../components/admin/admin-shell";

const SessionProbe = () => {
  return <div data-testid="probe">section content</div>;
};

describe("AdminShell", () => {
  beforeEach(() => {
    sessionStorage.clear();
    mockPathname = "/en/admin/overview";
    officerLogin.mockClear();
  });

  it("shows_the_officer_login_when_there_is_no_session", async () => {
    render(
      <AdminShell locale="en">
        <SessionProbe />
      </AdminShell>,
    );

    expect(await screen.findByText("Compliance Review")).toBeInTheDocument();
    expect(screen.queryByTestId("probe")).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });

  it("renders_the_sidebar_and_children_once_authenticated", async () => {
    sessionStorage.setItem("tokenization.officerToken", "officer-tok");
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
    sessionStorage.setItem("tokenization.officerToken", "officer-tok");
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
    sessionStorage.setItem("tokenization.officerToken", "officer-tok");
    mockPathname = "/en/admin/investors/abc-123";
    render(
      <AdminShell locale="en">
        <SessionProbe />
      </AdminShell>,
    );

    const active = await screen.findByRole("link", { current: "page" });
    expect(active).toHaveTextContent("Investors");
  });

  it("logs_out_and_returns_to_the_login", async () => {
    sessionStorage.setItem("tokenization.officerToken", "officer-tok");
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
    expect(sessionStorage.getItem("tokenization.officerToken")).toBeNull();
    expect(await screen.findByText("Compliance Review")).toBeInTheDocument();
  });
});
