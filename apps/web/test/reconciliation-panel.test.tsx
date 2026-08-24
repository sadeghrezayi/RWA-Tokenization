import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ReconciliationPanel } from "../components/admin/reconciliation-panel";
import type { ApiClient, DistributionReconciliationDto } from "../lib/api";
import { stubApi } from "./auth-panel.test";

const agrees: DistributionReconciliationDto = {
  distributionId: "d-ok",
  assetId: "asset-1",
  paidAt: "2026-08-20T10:00:00.000Z",
  declaredRial: "100000",
  creditedRial: "100000",
  differenceRial: "0",
  status: "agrees",
};

const disagrees: DistributionReconciliationDto = {
  distributionId: "d-bad",
  assetId: "asset-2",
  paidAt: "2026-08-21T10:00:00.000Z",
  declaredRial: "100000",
  creditedRial: "60000",
  differenceRial: "-40000",
  status: "disagrees",
};

const untraceable: DistributionReconciliationDto = {
  distributionId: "d-old",
  assetId: "asset-3",
  paidAt: "2026-07-01T10:00:00.000Z",
  declaredRial: "50000",
  status: "not_reconcilable",
};

const renderPanel = (rows: DistributionReconciliationDto[], overrides: Partial<ApiClient> = {}) =>
  render(
    <ReconciliationPanel
      locale="en"
      token="tok"
      api={stubApi({
        distributionReconciliation: vi.fn().mockResolvedValue(rows),
        ...overrides,
      })}
    />,
  );

// FR-RA-4, the auditor's own screen. An endpoint no one can read is not a
// delivered capability — this is where "distributions vs bank records" becomes
// something a person actually sees.
describe("ReconciliationPanel", () => {
  it("shows a mismatch with the amount that went missing", async () => {
    renderPanel([disagrees]);

    const row = await screen.findByTestId("reconciliation-0");
    expect(row.textContent).toMatch(/100,000/);
    expect(row.textContent).toMatch(/60,000/);
    // The difference is the number an auditor acts on.
    expect(row.textContent).toMatch(/40,000/);
  });

  it("marks an untraceable distribution as NOT checked, never as agreeing", async () => {
    // The honesty rule this whole feature rests on: a payout whose credits
    // predate the reference column cannot be verified. Showing it as agreeing
    // would tell an auditor a figure was checked when it was not.
    renderPanel([untraceable]);

    await screen.findByTestId("reconciliation-0");
    // Assert the VERDICT specifically. Matching the row's whole text passed
    // even when the badge read "Agrees", because the explanatory hint below it
    // contains "cannot be verified" — a test green for the wrong reason,
    // caught by mutation rather than by reading it.
    const verdict = screen.getByTestId("reconciliation-verdict-0");
    expect(verdict.textContent).toMatch(/not checked/i);
    expect(verdict.textContent).not.toMatch(/agree/i);
    // And it must not claim a credited figure it does not have.
    expect(screen.getByTestId("reconciliation-0").textContent).not.toMatch(/Reached holders/);
  });

  it("counts the disagreements, so an auditor sees the exceptions at a glance", async () => {
    renderPanel([disagrees, untraceable, agrees]);

    const summary = await screen.findByTestId("reconciliation-summary");
    expect(summary.textContent).toMatch(/1/);
  });

  it("says everything agrees when it does, rather than showing an empty box", async () => {
    renderPanel([agrees]);

    await screen.findByTestId("reconciliation-0");
    expect(screen.getByTestId("reconciliation-summary").textContent).toMatch(/0|no/i);
  });

  it("says plainly when no distribution has been paid yet", async () => {
    renderPanel([]);

    expect(await screen.findByTestId("no-reconciliation")).toBeTruthy();
  });

  it("distinguishes a failed load from a clean set of books", async () => {
    // "Could not read this" must never render as "everything agrees" — that is
    // the single most dangerous thing this screen could get wrong.
    renderPanel([], {
      distributionReconciliation: vi.fn().mockRejectedValue(new Error("upstream is down")),
    });

    expect((await screen.findByRole("alert")).textContent).toMatch(/upstream is down/);
    expect(screen.queryByTestId("no-reconciliation")).toBeNull();
    expect(screen.queryByTestId("reconciliation-summary")).toBeNull();
  });
});
