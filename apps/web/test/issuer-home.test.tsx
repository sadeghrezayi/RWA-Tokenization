import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { IssuerHome } from "../components/issuer/issuer-home";
import type { ApiClient, MyIssuerOrganisationDto } from "../lib/api";
import { stubApi } from "./auth-panel.test";

const approved: MyIssuerOrganisationDto = {
  id: "org-1",
  legalName: "Vanak Property Holdings PJSC",
  registrationNumber: "IR-448120",
  contactEmail: "ops@vanak.example",
  state: "approved",
  appliedAt: "2026-08-15T09:00:00.000Z",
  decidedAt: "2026-08-16T09:00:00.000Z",
  canSubmitAssets: true,
  role: "issuer_admin",
  canManageTeam: true,
  canWorkOnAssets: true,
};

const stillApplied: MyIssuerOrganisationDto = {
  ...approved,
  id: "org-2",
  legalName: "Elahiyeh Estates Ltd",
  state: "applied",
  canSubmitAssets: false,
  role: "issuer_contributor",
  canManageTeam: false,
};

const renderHome = (rows: MyIssuerOrganisationDto[], overrides: Partial<ApiClient> = {}) =>
  render(
    <IssuerHome
      locale="en"
      api={stubApi({ myIssuerOrganisations: vi.fn().mockResolvedValue(rows), ...overrides })}
    />,
  );

describe("IssuerHome", () => {
  it("names the organisation this person acts for, and their role in it", async () => {
    renderHome([approved]);

    const card = await screen.findByTestId("my-issuer-org-1");
    expect(card.textContent).toContain("Vanak Property Holdings PJSC");
    expect(card.textContent).toContain("IR-448120");
    // The role in words a person recognises, not the stored token.
    expect(card.textContent).toContain("Administrator");
    expect(card.textContent).not.toContain("issuer_admin");
  });

  it("says plainly when the organisation may not submit assets yet", async () => {
    renderHome([stillApplied]);

    const card = await screen.findByTestId("my-issuer-org-2");
    // The same word the platform's own console uses for this state — one
    // vocabulary, so an issuer and an officer are never describing the same
    // organisation differently. And the consequence, stated: no assets yet.
    expect(card.textContent).toContain("Applied");
    expect(card.textContent).toContain("cannot bring assets yet");
  });

  it("distinguishes a contributor from an administrator", async () => {
    renderHome([stillApplied]);

    const card = await screen.findByTestId("my-issuer-org-2");
    expect(card.textContent).toContain("Contributor");
    expect(card.textContent).not.toContain("Administrator");
  });

  it("tells a person who acts for no issuer what is true, rather than showing nothing", async () => {
    renderHome([]);

    expect(await screen.findByTestId("no-issuer-membership")).toBeTruthy();
  });

  it("shows every organisation when a person acts for more than one", async () => {
    renderHome([approved, stillApplied]);

    expect(await screen.findByTestId("my-issuer-org-1")).toBeTruthy();
    expect(screen.getByTestId("my-issuer-org-2")).toBeTruthy();
  });

  it("reports a failure to load rather than looking like an empty account", async () => {
    renderHome([], { myIssuerOrganisations: vi.fn().mockRejectedValue(new Error("network")) });

    expect(await screen.findByRole("alert")).toBeTruthy();
    // The "you act for no issuer" message is a claim about the person; it must
    // never stand in for "we could not ask".
    expect(screen.queryByTestId("no-issuer-membership")).toBeNull();
  });
});
