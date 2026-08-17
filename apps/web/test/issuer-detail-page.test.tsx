import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { IssuerDetailPage } from "../components/admin/issuer-detail-page";
import type { ApiClient, IssuerMemberDto, IssuerOrganisationDto } from "../lib/api";
import { stubApi } from "./auth-panel.test";

const organisation: IssuerOrganisationDto = {
  id: "org-1",
  legalName: "Vanak Property Holdings PJSC",
  registrationNumber: "IR-448120",
  contactEmail: "ops@vanak.example",
  state: "approved",
  appliedAt: "2026-08-15T09:00:00.000Z",
  decidedAt: "2026-08-16T09:00:00.000Z",
  decidedBy: "officer-1",
  decidedByLabel: "compliance@platform.local",
  canSubmitAssets: true,
};

const admin: IssuerMemberDto = {
  userId: "user-founder",
  email: "founder@vanak.example",
  role: "issuer_admin",
  addedAt: "2026-08-15T09:00:00.000Z",
  canManageTeam: true,
};

const contributor: IssuerMemberDto = {
  userId: "user-colleague",
  email: "colleague@vanak.example",
  role: "issuer_contributor",
  addedAt: "2026-08-16T09:00:00.000Z",
  canManageTeam: false,
};

const renderPage = (overrides: Partial<ApiClient> = {}, team = [admin, contributor]) =>
  render(
    <IssuerDetailPage
      locale="en"
      api={stubApi({
        issuer: vi.fn().mockResolvedValue(organisation),
        issuerTeam: vi.fn().mockResolvedValue(team),
        ...overrides,
      })}
      csrfToken="csrf"
      organisationId="org-1"
      onBack={vi.fn()}
    />,
  );

describe("IssuerDetailPage", () => {
  it("shows the organisation's legal identity and its decision", async () => {
    renderPage();

    expect(await screen.findByText("Vanak Property Holdings PJSC")).toBeTruthy();
    expect(screen.getByText(/IR-448120/)).toBeTruthy();
    // The officer who decided is named, and the account id is not shown.
    expect(screen.getByText(/compliance@platform\.local/)).toBeTruthy();
    expect(screen.queryByText(/officer-1/)).toBeNull();
  });

  it("lists the people acting for the issuer, by address and role", async () => {
    renderPage();

    const row = await screen.findByTestId("member-user-colleague");
    expect(row.textContent).toContain("colleague@vanak.example");
    expect(row.textContent).not.toContain("user-colleague");
  });

  it("says the team is empty rather than showing a bare table", async () => {
    renderPage({}, []);

    expect(await screen.findByText(/nobody acts for/i)).toBeTruthy();
  });

  it("distinguishes a failed load from an empty team", async () => {
    renderPage({ issuerTeam: vi.fn().mockRejectedValue(new Error("network is down")) });

    expect(await screen.findByRole("alert")).toHaveTextContent(/network is down/i);
  });

  it("invites a colleague by email in the role chosen, then refreshes", async () => {
    const addIssuerMember = vi.fn().mockResolvedValue(undefined);
    const issuerTeam = vi
      .fn()
      .mockResolvedValueOnce([admin])
      .mockResolvedValue([admin, contributor]);
    renderPage({ addIssuerMember, issuerTeam });

    await screen.findByTestId("member-user-founder");
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: "colleague@vanak.example" },
    });
    fireEvent.change(screen.getByLabelText(/role/i), { target: { value: "issuer_contributor" } });
    fireEvent.click(screen.getByRole("button", { name: /invite/i }));

    await waitFor(() => {
      expect(addIssuerMember).toHaveBeenCalledWith(
        "csrf",
        "org-1",
        "colleague@vanak.example",
        "issuer_contributor",
      );
    });
    expect(await screen.findByTestId("member-user-colleague")).toBeTruthy();
  });

  it("refuses to invite nobody, and never calls the server", async () => {
    const addIssuerMember = vi.fn().mockResolvedValue(undefined);
    renderPage({ addIssuerMember });

    await screen.findByTestId("member-user-founder");
    fireEvent.click(screen.getByRole("button", { name: /invite/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/email/i);
    expect(addIssuerMember).not.toHaveBeenCalled();
  });

  it("surfaces the server's refusal when the person is not verified", async () => {
    // The rule the whole phase exists for: the officer must see WHY, not a
    // silent failure.
    renderPage({
      addIssuerMember: vi
        .fn()
        .mockRejectedValue(new Error('"user-x" has not completed individual verification')),
    });

    await screen.findByTestId("member-user-founder");
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: "unverified@vanak.example" },
    });
    fireEvent.click(screen.getByRole("button", { name: /invite/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/individual verification/i);
  });

  it("removes a person from the team", async () => {
    const removeIssuerMember = vi.fn().mockResolvedValue(undefined);
    renderPage({ removeIssuerMember });

    const row = await screen.findByTestId("member-user-colleague");
    fireEvent.click(within(row).getByRole("button", { name: /remove/i }));

    await waitFor(() => {
      expect(removeIssuerMember).toHaveBeenCalledWith("csrf", "org-1", "user-colleague");
    });
  });

  it("surfaces the refusal to remove the last administrator", async () => {
    renderPage({
      removeIssuerMember: vi
        .fn()
        .mockRejectedValue(new Error("must keep at least one administrator")),
    });

    const row = await screen.findByTestId("member-user-founder");
    fireEvent.click(within(row).getByRole("button", { name: /remove/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/at least one administrator/i);
  });
});
