import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { DueReviewsPanel } from "../components/admin/due-reviews-panel";
import type { ApiClient, DueReviewDto, ReviewCadenceDto } from "../lib/api";
import { stubApi } from "./auth-panel.test";

const cadence: ReviewCadenceDto = {
  provisional: true,
  notice:
    "Provisional review cadence — how often a customer must be re-screened and re-rated is a policy decision. This cadence REQUIRES LOCAL LEGAL VALIDATION before production use. A lapsed review restricts nobody.",
  months: { high: 12, medium: 24, low: 36 },
};

const rows: DueReviewDto[] = [
  { investorId: "inv-2", email: "never@example.com", state: "never_reviewed" },
  {
    investorId: "inv-1",
    email: "late@example.com",
    state: "overdue",
    band: "high",
    lastReviewedAt: "2024-01-01T00:00:00.000Z",
    dueAt: "2025-01-01T00:00:00.000Z",
    overdueByDays: 599,
  },
];

const renderPanel = (due: DueReviewDto[], overrides: Partial<ApiClient> = {}) =>
  render(
    <DueReviewsPanel
      locale="en"
      token="tok"
      api={stubApi({
        dueReviews: vi.fn().mockResolvedValue(due),
        reviewCadence: vi.fn().mockResolvedValue(cadence),
        ...overrides,
      })}
    />,
  );

// 4.2. A work list whose worst entries are buried is not a work list, and a
// cadence presented as the platform's own rule is a compliance claim nobody
// validated.
describe("DueReviewsPanel", () => {
  it("shows a customer nobody has reviewed, and says so in words", async () => {
    renderPanel(rows);

    const row = await screen.findByTestId("due-review-0");
    expect(row.textContent).toMatch(/never@example.com/);
    // Not a blank cell or a dash: the state is the point of the row.
    expect(row.textContent).toMatch(/never been reviewed/i);
  });

  it("keeps the order the API gave, worst first", async () => {
    renderPanel(rows);

    await screen.findByTestId("due-review-0");
    expect(screen.getByTestId("due-review-0").textContent).toMatch(/never@example.com/);
    expect(screen.getByTestId("due-review-1").textContent).toMatch(/late@example.com/);
  });

  it("says how late an overdue review is, not merely that it is late", async () => {
    renderPanel(rows);

    const row = await screen.findByTestId("due-review-1");
    expect(row.textContent).toMatch(/599/);
  });

  it("shows the cadence as provisional and needing local legal validation", async () => {
    renderPanel([]);

    const notice = await screen.findByTestId("review-cadence-notice");
    expect(notice.textContent).toMatch(/REQUIRES LOCAL LEGAL VALIDATION/);
  });

  it("says nothing is due, rather than showing an empty box", async () => {
    renderPanel([]);

    expect(await screen.findByTestId("no-due-reviews")).toBeTruthy();
  });

  it("distinguishes a failed load from an empty list", async () => {
    // "Could not read this" must never be shown as "nobody is due".
    renderPanel([], { dueReviews: vi.fn().mockRejectedValue(new Error("upstream is down")) });

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/upstream is down/);
    expect(screen.queryByTestId("no-due-reviews")).toBeNull();
  });
});
