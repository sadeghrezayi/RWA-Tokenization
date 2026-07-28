import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import { OpsPanel } from "../components/admin/ops-panel";
import type { WorkQueueDto } from "../lib/api";
import { stubApi } from "./auth-panel.test";

const queue = (overrides: Partial<WorkQueueDto> = {}): WorkQueueDto => ({
  totalOutstanding: 4,
  sections: [
    {
      key: "kyc",
      total: 2,
      items: [
        { id: "inv-1", label: "KYC review for sara@demo.com" },
        { id: "inv-2", label: "KYC review for ali@demo.com" },
      ],
    },
    {
      key: "approvals",
      total: 1,
      items: [
        {
          id: "apr-1",
          label: "Credit 35,000,000,000 Rial to sara@demo.com",
          waitingSince: "2026-07-20T12:00:00.000Z",
        },
      ],
    },
    {
      key: "redemptions",
      total: 1,
      items: [
        {
          id: "red-1",
          label: "Redemption of 100 tokens",
          waitingSince: "2026-07-26T12:00:00.000Z",
        },
      ],
    },
  ],
  ...overrides,
});

const api = (view: WorkQueueDto = queue()) =>
  stubApi({ getWorkQueue: vi.fn().mockResolvedValue(view) });

describe("OpsPanel", () => {
  it("shows a count for each queue", async () => {
    render(<OpsPanel locale="en" api={api()} token="csrf" />);

    const kyc = await screen.findByTestId("queue-card-kyc");
    expect(within(kyc).getByText("2")).toBeInTheDocument();
    expect(within(screen.getByTestId("queue-card-approvals")).getByText("1")).toBeInTheDocument();
    expect(within(screen.getByTestId("queue-card-redemptions")).getByText("1")).toBeInTheDocument();
  });

  it("links each queue to the page where the work is actually done", async () => {
    render(<OpsPanel locale="en" api={api()} token="csrf" />);

    const kyc = await screen.findByTestId("queue-card-kyc");
    expect(within(kyc).getByRole("link")).toHaveAttribute("href", "/en/admin/kyc");
    expect(within(screen.getByTestId("queue-card-approvals")).getByRole("link")).toHaveAttribute(
      "href",
      "/en/admin/approvals",
    );
    expect(within(screen.getByTestId("queue-card-redemptions")).getByRole("link")).toHaveAttribute(
      "href",
      "/en/admin/redemptions",
    );
  });

  it("lists the waiting items so an operator can triage without clicking through", async () => {
    render(<OpsPanel locale="en" api={api()} token="csrf" />);

    expect(await screen.findByText("KYC review for sara@demo.com")).toBeInTheDocument();
    expect(screen.getByText("Credit 35,000,000,000 Rial to sara@demo.com")).toBeInTheDocument();
    expect(screen.getByText("Redemption of 100 tokens")).toBeInTheDocument();
  });

  it("marks a queue as needing attention only when it has work", async () => {
    render(
      <OpsPanel
        locale="en"
        api={api(
          queue({
            totalOutstanding: 2,
            sections: [
              { key: "kyc", total: 2, items: [{ id: "inv-1", label: "KYC review for a@x.co" }] },
              { key: "approvals", total: 0, items: [] },
              { key: "redemptions", total: 0, items: [] },
            ],
          }),
        )}
        token="csrf"
      />,
    );

    const kyc = await screen.findByTestId("queue-card-kyc");
    expect(kyc.className).toContain("queue-card--attention");
    expect(screen.getByTestId("queue-card-approvals").className).not.toContain(
      "queue-card--attention",
    );
  });

  it("says everything is clear when nothing is waiting", async () => {
    render(
      <OpsPanel
        locale="en"
        api={api(
          queue({
            totalOutstanding: 0,
            sections: [
              { key: "kyc", total: 0, items: [] },
              { key: "approvals", total: 0, items: [] },
              { key: "redemptions", total: 0, items: [] },
            ],
          }),
        )}
        token="csrf"
      />,
    );

    expect(await screen.findByText(/Nothing is waiting/i)).toBeInTheDocument();
  });

  it("shows a skeleton while loading, not an empty-looking dashboard", () => {
    const never = stubApi({ getWorkQueue: vi.fn().mockReturnValue(new Promise(() => undefined)) });
    render(<OpsPanel locale="en" api={never} token="csrf" />);

    expect(screen.getByTestId("ops-skeleton")).toBeInTheDocument();
    expect(screen.queryByText(/Nothing is waiting/i)).not.toBeInTheDocument();
  });

  it("surfaces a load failure instead of pretending the queue is empty", async () => {
    const failing = stubApi({
      getWorkQueue: vi.fn().mockRejectedValue(new Error("network down")),
    });
    render(<OpsPanel locale="en" api={failing} token="csrf" />);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
    expect(screen.queryByText(/Nothing is waiting/i)).not.toBeInTheDocument();
  });
});
