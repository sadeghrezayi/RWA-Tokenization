import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ScreeningCard } from "../components/admin/screening-card";
import type { ApiClient, ScreeningDto } from "../lib/api";
import { stubApi } from "./auth-panel.test";

const simulated: ScreeningDto = {
  outcome: "clear",
  provider: "mock",
  simulated: true,
  checkedAt: "2026-08-22T10:00:00.000Z",
  disclaimer: "SIMULATED — no sanctions or PEP list was checked. This result decides nothing.",
};

const renderCard = (rows: ScreeningDto[], overrides: Partial<ApiClient> = {}) =>
  render(
    <ScreeningCard
      locale="en"
      investorId="inv-1"
      token="tok"
      api={stubApi({ investorScreenings: vi.fn().mockResolvedValue(rows), ...overrides })}
    />,
  );

// 4.2. The platform invariant is that fake compliance is always labeled as
// such. Everything before this slice carried the label in data; this is where a
// person finally reads it, so this is where it has to be impossible to miss.
describe("ScreeningCard", () => {
  it("shows a simulated result WITH its disclaimer, never the outcome alone", async () => {
    renderCard([simulated]);

    const row = await screen.findByTestId("screening-0");
    expect(row.textContent).toMatch(/clear/i);
    // The outcome must never appear without the words that qualify it.
    expect(await screen.findByTestId("screening-disclaimer-0")).toBeTruthy();
    expect(screen.getByTestId("screening-disclaimer-0").textContent).toMatch(/simulated/i);
  });

  it("shows no disclaimer when a real provider answered", async () => {
    // Written out in full rather than spread-and-omitted: with
    // exactOptionalPropertyTypes a real result has NO disclaimer key at all,
    // which is a different type from one holding undefined.
    renderCard([
      {
        outcome: "clear",
        provider: "acme-sanctions",
        simulated: false,
        checkedAt: "2026-08-22T10:00:00.000Z",
      },
    ]);

    await screen.findByTestId("screening-0");
    expect(screen.queryByTestId("screening-disclaimer-0")).toBeNull();
    expect(screen.getByTestId("screening-0").textContent).toMatch(/acme-sanctions/);
  });

  it("says plainly when nobody has been screened yet, rather than showing an empty box", async () => {
    renderCard([]);

    expect(await screen.findByTestId("no-screenings")).toBeTruthy();
  });

  it("runs a screening and shows the new result", async () => {
    const screenInvestor = vi.fn().mockResolvedValue(simulated);
    const investorScreenings = vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([simulated]);
    renderCard([], { screenInvestor, investorScreenings });

    await screen.findByTestId("no-screenings");
    fireEvent.click(screen.getByRole("button", { name: /screen/i }));

    await waitFor(() => {
      expect(screenInvestor).toHaveBeenCalledWith("tok", "inv-1");
    });
    expect(await screen.findByTestId("screening-0")).toBeTruthy();
  });

  it("shows the platform's refusal instead of pretending a check ran", async () => {
    renderCard([], {
      screenInvestor: vi
        .fn()
        .mockRejectedValue(new Error("this applicant has not declared a name yet")),
    });

    await screen.findByTestId("no-screenings");
    fireEvent.click(screen.getByRole("button", { name: /screen/i }));

    expect((await screen.findByRole("alert")).textContent).toMatch(/declared a name/i);
  });
});
