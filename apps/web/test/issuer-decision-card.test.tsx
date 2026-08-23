import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { IssuerDecisionCard } from "../components/admin/issuer-decision-card";
import type { ApiClient, IssuerStateDto } from "../lib/api";
import { stubApi } from "./auth-panel.test";

const renderCard = (
  state: IssuerStateDto,
  overrides: Partial<ApiClient> = {},
  onDecided = vi.fn(),
) =>
  render(
    <IssuerDecisionCard
      locale="en"
      organisationId="org-1"
      csrfToken="tok"
      state={state}
      api={stubApi(overrides)}
      onDecided={onDecided}
    />,
  );

// 4.3 org review workspace. Same gap as the investor side: the decision lived
// only in a queue row, while the organisation's identity and its team — the
// things a reviewer weighs — were on the detail page.
describe("IssuerDecisionCard", () => {
  it("offers ONLY start-review on a fresh application", async () => {
    renderCard("applied");

    expect(await screen.findByTestId("issuer-start-review")).toBeTruthy();
    expect(screen.queryByTestId("issuer-approve")).toBeNull();
    expect(screen.queryByTestId("issuer-suspend")).toBeNull();
  });

  it("offers approve and reject once the review has started", async () => {
    renderCard("in_review");

    expect(await screen.findByTestId("issuer-approve")).toBeTruthy();
    expect(screen.getByTestId("issuer-reject")).toBeTruthy();
    expect(screen.queryByTestId("issuer-start-review")).toBeNull();
  });

  it("offers suspension on an approved organisation, and nothing else", async () => {
    // Approval is reversible: "something is wrong here" needs a lever that
    // bites immediately.
    renderCard("approved");

    expect(await screen.findByTestId("issuer-suspend")).toBeTruthy();
    expect(screen.queryByTestId("issuer-approve")).toBeNull();
    expect(screen.queryByTestId("issuer-reject")).toBeNull();
  });

  it("offers reinstatement on a suspended organisation", async () => {
    renderCard("suspended");

    expect(await screen.findByTestId("issuer-reinstate")).toBeTruthy();
  });

  it("offers nothing on a rejected organisation, because rejection is terminal", async () => {
    // Re-applying is a NEW application, not a quietly edited old one.
    renderCard("rejected");

    expect(await screen.findByTestId("issuer-no-actions")).toBeTruthy();
  });

  it("REFUSES a rejection with no reason, without calling the server", async () => {
    const rejectIssuer = vi.fn();
    renderCard("in_review", { rejectIssuer });

    fireEvent.click(await screen.findByTestId("issuer-reject"));

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(rejectIssuer).not.toHaveBeenCalled();
  });

  it("REFUSES a suspension with no reason either", async () => {
    const suspendIssuer = vi.fn();
    renderCard("approved", { suspendIssuer });

    fireEvent.click(await screen.findByTestId("issuer-suspend"));

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(suspendIssuer).not.toHaveBeenCalled();
  });

  it("sends a rejection with its reason and tells the page to reload", async () => {
    const rejectIssuer = vi.fn().mockResolvedValue(undefined);
    const onDecided = vi.fn();
    renderCard("in_review", { rejectIssuer }, onDecided);

    fireEvent.change(await screen.findByTestId("issuer-reason"), {
      target: { value: "the registration number matches no company" },
    });
    fireEvent.click(screen.getByTestId("issuer-reject"));

    await waitFor(() => {
      expect(rejectIssuer).toHaveBeenCalledWith(
        "tok",
        "org-1",
        "the registration number matches no company",
      );
    });
    expect(onDecided).toHaveBeenCalled();
  });

  it("approves without demanding a reason", async () => {
    const approveIssuer = vi.fn().mockResolvedValue(undefined);
    renderCard("in_review", { approveIssuer });

    fireEvent.click(await screen.findByTestId("issuer-approve"));

    await waitFor(() => {
      expect(approveIssuer).toHaveBeenCalledWith("tok", "org-1");
    });
  });
});
