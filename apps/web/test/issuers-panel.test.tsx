import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { IssuersPanel } from "../components/admin/issuers-panel";
import type { ApiClient, IssuerOrganisationDto } from "../lib/api";
import { stubApi } from "./auth-panel.test";

const applied: IssuerOrganisationDto = {
  id: "org-1",
  legalName: "Vanak Property Holdings PJSC",
  registrationNumber: "IR-448120",
  contactEmail: "ops@vanak.example",
  state: "applied",
  appliedAt: "2026-08-15T09:00:00.000Z",
  canSubmitAssets: false,
};

const approved: IssuerOrganisationDto = {
  ...applied,
  id: "org-2",
  legalName: "Elahiyeh Estates Ltd",
  state: "approved",
  decidedAt: "2026-08-16T09:00:00.000Z",
  decidedBy: "officer-1",
  canSubmitAssets: true,
};

const renderPanel = (overrides: Partial<ApiClient> = {}, rows = [applied]) =>
  render(
    <IssuersPanel
      locale="en"
      api={stubApi({ issuers: vi.fn().mockResolvedValue(rows), ...overrides })}
      csrfToken="csrf"
    />,
  );

describe("IssuersPanel", () => {
  it("shows what an officer needs to decide about an applicant", async () => {
    renderPanel();

    const row = await screen.findByTestId("issuer-org-1");
    // The legal identity of the entity — the things an officer checks against a
    // registry — not an internal id.
    expect(row.textContent).toContain("Vanak Property Holdings PJSC");
    expect(row.textContent).toContain("IR-448120");
    expect(row.textContent).toContain("ops@vanak.example");
    expect(row.textContent).not.toContain("org-1");
  });

  it("says the queue is empty rather than showing a bare table", async () => {
    renderPanel({}, []);

    expect(await screen.findByText(/no issuer applications/i)).toBeTruthy();
  });

  it("distinguishes a failed load from an empty queue", async () => {
    // "Could not read this" must never look like "nobody has applied" — that
    // would leave real applicants waiting indefinitely.
    renderPanel({ issuers: vi.fn().mockRejectedValue(new Error("network is down")) });

    expect(await screen.findByRole("alert")).toHaveTextContent(/network is down/i);
  });

  it("walks an application from review to approval, refreshing what it shows", async () => {
    const startReview = vi.fn().mockResolvedValue(undefined);
    const approve = vi.fn().mockResolvedValue(undefined);
    const issuers = vi
      .fn()
      .mockResolvedValueOnce([applied])
      .mockResolvedValueOnce([{ ...applied, state: "in_review" }])
      .mockResolvedValue([{ ...applied, state: "approved", canSubmitAssets: true }]);
    renderPanel({ issuers, startIssuerReview: startReview, approveIssuer: approve });

    fireEvent.click(await screen.findByRole("button", { name: /start review/i }));
    await waitFor(() => {
      expect(startReview).toHaveBeenCalledWith("csrf", "org-1");
    });

    fireEvent.click(await screen.findByRole("button", { name: /^approve$/i }));
    await waitFor(() => {
      expect(approve).toHaveBeenCalledWith("csrf", "org-1");
    });
    expect(await screen.findByText(/may bring assets/i)).toBeTruthy();
  });

  it("offers only the decisions the application's state allows", async () => {
    // An officer must not be shown an action the server will refuse: approving
    // something nobody has reviewed is a 409.
    renderPanel();

    await screen.findByTestId("issuer-org-1");
    expect(screen.queryByRole("button", { name: /^approve$/i })).toBeNull();
    expect(screen.getByRole("button", { name: /start review/i })).toBeTruthy();
  });

  it("refuses to send a rejection with no reason, and never calls the server", async () => {
    const reject = vi.fn().mockResolvedValue(undefined);
    renderPanel({ rejectIssuer: reject }, [{ ...applied, state: "in_review" }]);

    fireEvent.click(await screen.findByRole("button", { name: /^reject$/i }));
    fireEvent.click(screen.getByRole("button", { name: /send rejection/i }));

    // The message tells the officer what to do, not what a field is called.
    expect(await screen.findByRole("alert")).toHaveTextContent(/say why/i);
    expect(reject).not.toHaveBeenCalled();
  });

  it("sends the rejection reason the officer wrote", async () => {
    const reject = vi.fn().mockResolvedValue(undefined);
    renderPanel({ rejectIssuer: reject }, [{ ...applied, state: "in_review" }]);

    fireEvent.click(await screen.findByRole("button", { name: /^reject$/i }));
    fireEvent.change(screen.getByLabelText(/reason/i), {
      target: { value: "registration number does not match the registry" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send rejection/i }));

    await waitFor(() => {
      expect(reject).toHaveBeenCalledWith(
        "csrf",
        "org-1",
        "registration number does not match the registry",
      );
    });
  });

  it("suspends an approved issuer with a reason, and can restore it", async () => {
    const suspend = vi.fn().mockResolvedValue(undefined);
    const reinstate = vi.fn().mockResolvedValue(undefined);
    const issuers = vi
      .fn()
      .mockResolvedValueOnce([approved])
      .mockResolvedValue([{ ...approved, state: "suspended", canSubmitAssets: false }]);
    renderPanel({ issuers, suspendIssuer: suspend, reinstateIssuer: reinstate }, [approved]);

    fireEvent.click(await screen.findByRole("button", { name: /suspend/i }));
    fireEvent.change(screen.getByLabelText(/reason/i), {
      target: { value: "under investigation" },
    });
    fireEvent.click(screen.getByRole("button", { name: /confirm suspension/i }));

    await waitFor(() => {
      expect(suspend).toHaveBeenCalledWith("csrf", "org-2", "under investigation");
    });

    fireEvent.click(await screen.findByRole("button", { name: /reinstate/i }));
    await waitFor(() => {
      expect(reinstate).toHaveBeenCalledWith("csrf", "org-2");
    });
  });

  it("names the officer who decided rather than their account id", async () => {
    renderPanel({}, [{ ...approved, decidedByLabel: "compliance@platform.local" }]);

    const row = await screen.findByTestId("issuer-org-2");
    expect(row.textContent).toContain("compliance@platform.local");
    expect(row.textContent).not.toContain("officer-1");
  });

  it("falls back to the account id when the officer cannot be named", async () => {
    // Losing who decided would be worse than showing an id.
    renderPanel({}, [approved]);

    const row = await screen.findByTestId("issuer-org-2");
    expect(row.textContent).toContain("officer-1");
  });

  it("says why a rejected application was refused", async () => {
    renderPanel({}, [
      {
        ...applied,
        state: "rejected",
        decidedAt: "2026-08-16T09:00:00.000Z",
        decidedBy: "officer-1",
        rejectionReason: "registration number does not match the registry",
      },
    ]);

    const row = await screen.findByTestId("issuer-org-1");
    expect(row.textContent).toContain("registration number does not match the registry");
  });

  it("surfaces the server's refusal instead of pretending the decision landed", async () => {
    renderPanel({
      startIssuerReview: vi
        .fn()
        .mockRejectedValue(new Error("requires the issuer.manage permission")),
    });

    fireEvent.click(await screen.findByRole("button", { name: /start review/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/issuer.manage/i);
  });
});
