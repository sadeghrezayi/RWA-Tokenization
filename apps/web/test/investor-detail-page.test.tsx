import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InvestorDetailPage } from "../components/investor-detail-page";
import { ApiError } from "../lib/api";
import type { ApiClient, InvestorDetailDto } from "../lib/api";

const detail: InvestorDetailDto = {
  investor: {
    id: "sara-id",
    email: "sara@demo.com",
    emailVerified: true,
    kycState: "approved",
    eligibleForClaims: true,
  },
  chain: {
    identityAddress: "0xId1234567890abcdef",
    walletAddress: "0x7ab685e2cbcd42084733be6222b16d35db0b60a0",
  },
  ledger: { balanceRial: "1250140000", heldRial: "0" },
  holdings: [
    { assetId: "asset-1", assetName: "Vanak Tower SPV", tokenAddress: "0xTok1", tokens: "35" },
  ],
  transfers: [
    {
      id: "tr-1",
      direction: "sent",
      counterparty: "bob@demo.com",
      assetName: "Vanak Tower SPV",
      tokens: "15",
      at: "2026-07-20T06:50:26.000Z",
    },
  ],
  redemptions: [
    {
      id: "red-1",
      assetName: "Vanak Tower SPV",
      tokens: "10",
      state: "fulfilled",
      requestedAt: "2026-07-20T06:50:26.000Z",
      payoutRial: "1250000000",
    },
  ],
  crm: {
    stage: "active",
    tags: ["qualified", "referred"],
    followUps: [
      {
        id: "f1",
        text: "Send prospectus",
        dueAt: "2026-01-01T00:00:00.000Z",
        state: "open",
        overdue: true,
      },
    ],
  },
  sales: {
    totalInvestedRial: "60000",
    portfolioValueRial: "6250000000",
    portfolioValueFresh: true,
    holdings: [
      {
        assetId: "asset-1",
        assetName: "Vanak Tower SPV",
        tokens: "35",
        valueRial: "6250000000",
        valuationFresh: true,
      },
    ],
    subscriptions: [
      {
        offeringId: "off-1",
        assetName: "Vanak Tower SPV",
        state: "closed_success",
        requested: "60",
        allocated: "60",
        costRial: "60000",
        refundRial: "0",
        closesAt: "2026-07-10T00:00:00.000Z",
      },
    ],
  },
  timeline: [
    {
      kind: "note",
      at: "2026-07-19T00:00:00.000Z",
      text: "Called about the offering.",
      actor: "officer-1",
    },
    {
      kind: "event",
      at: "2026-07-18T00:00:00.000Z",
      text: "offering_subscribed",
      actor: "sara-id",
      assetName: "Vanak Tower SPV",
    },
  ],
};

const apiWith = (overrides: Partial<ApiClient>): ApiClient =>
  ({
    investorDetail: vi.fn().mockResolvedValue(detail),
    setInvestorStage: vi.fn().mockResolvedValue(undefined),
    addInvestorTag: vi.fn().mockResolvedValue(undefined),
    removeInvestorTag: vi.fn().mockResolvedValue(undefined),
    addInvestorNote: vi.fn().mockResolvedValue({ noteId: "n1" }),
    createFollowUp: vi.fn().mockResolvedValue({ followUpId: "f2" }),
    completeFollowUp: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }) as ApiClient;

const renderPage = (api: ApiClient) =>
  render(
    <InvestorDetailPage locale="en" api={api} token="tok" investorId="sara-id" onBack={vi.fn()} />,
  );

describe("InvestorDetailPage", () => {
  it("shows_identity_kyc_and_sales_stats", async () => {
    renderPage(apiWith({}));

    expect(await screen.findByRole("heading", { name: "sara@demo.com" })).toBeInTheDocument();
    expect(screen.getByText("Approved")).toBeInTheDocument();
    expect(screen.getAllByText("60,000 ﷼").length).toBeGreaterThan(0); // invested
    expect(screen.getAllByText("6,250,000,000 ﷼").length).toBeGreaterThan(0); // portfolio value
  });

  it("renders_the_subscription_history_and_valued_portfolio", async () => {
    renderPage(apiWith({}));
    await screen.findByRole("heading", { name: "sara@demo.com" });

    expect(screen.getByText("Subscription history")).toBeInTheDocument();
    expect(screen.getByText("Closed — funded")).toBeInTheDocument();
    expect(screen.getAllByText("Vanak Tower SPV").length).toBeGreaterThan(0);
  });

  it("changes_the_relationship_stage", async () => {
    const setInvestorStage = vi.fn().mockResolvedValue(undefined);
    renderPage(apiWith({ setInvestorStage }));
    await screen.findByRole("heading", { name: "sara@demo.com" });

    await userEvent.selectOptions(screen.getByLabelText("Stage"), "dormant");

    await waitFor(() => {
      expect(setInvestorStage).toHaveBeenCalledWith("tok", "sara-id", "dormant");
    });
  });

  it("adds_and_removes_tags", async () => {
    const addInvestorTag = vi.fn().mockResolvedValue(undefined);
    const removeInvestorTag = vi.fn().mockResolvedValue(undefined);
    renderPage(apiWith({ addInvestorTag, removeInvestorTag }));
    await screen.findByRole("heading", { name: "sara@demo.com" });

    await userEvent.type(screen.getByLabelText("New tag"), "high-net-worth");
    await userEvent.click(screen.getByRole("button", { name: "Add tag" }));
    await waitFor(() => {
      expect(addInvestorTag).toHaveBeenCalledWith("tok", "sara-id", "high-net-worth");
    });

    await userEvent.click(screen.getByRole("button", { name: "Remove tag qualified" }));
    await waitFor(() => {
      expect(removeInvestorTag).toHaveBeenCalledWith("tok", "sara-id", "qualified");
    });
  });

  it("posts_a_note_from_the_composer", async () => {
    const addInvestorNote = vi.fn().mockResolvedValue({ noteId: "n2" });
    renderPage(apiWith({ addInvestorNote }));
    await screen.findByRole("heading", { name: "sara@demo.com" });

    await userEvent.type(screen.getByLabelText("Add a note"), "Followed up by phone.");
    await userEvent.click(screen.getByRole("button", { name: "Save note" }));

    await waitFor(() => {
      expect(addInvestorNote).toHaveBeenCalledWith("tok", "sara-id", "Followed up by phone.");
    });
  });

  it("shows_the_merged_timeline_with_notes_and_events", async () => {
    renderPage(apiWith({}));
    await screen.findByRole("heading", { name: "sara@demo.com" });

    expect(screen.getByText("Called about the offering.")).toBeInTheDocument();
    expect(screen.getByText("offering_subscribed")).toBeInTheDocument();
    // The investor's own actor id resolves to their email (P2), not a UUID —
    // appears both in the header and the timeline row.
    expect(screen.getAllByText("sara@demo.com").length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText("sara-id")).not.toBeInTheDocument();
  });

  it("completes_an_overdue_follow_up", async () => {
    const completeFollowUp = vi.fn().mockResolvedValue(undefined);
    renderPage(apiWith({ completeFollowUp }));
    await screen.findByRole("heading", { name: "sara@demo.com" });

    expect(screen.getByText("Overdue")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Complete" }));

    await waitFor(() => {
      expect(completeFollowUp).toHaveBeenCalledWith("tok", "f1");
    });
  });

  it("creates_a_follow_up", async () => {
    const createFollowUp = vi.fn().mockResolvedValue({ followUpId: "f9" });
    renderPage(apiWith({ createFollowUp }));
    await screen.findByRole("heading", { name: "sara@demo.com" });

    await userEvent.type(screen.getByLabelText("Follow-up"), "Quarterly review call");
    await userEvent.type(screen.getByLabelText("Due date"), "2026-09-01");
    await userEvent.click(screen.getByRole("button", { name: "Add follow-up" }));

    await waitFor(() => {
      expect(createFollowUp).toHaveBeenCalledWith("tok", "sara-id", {
        text: "Quarterly review call",
        dueAt: expect.stringContaining("2026-09-01") as string,
      });
    });
  });

  it("surfaces_a_load_error", async () => {
    renderPage(
      apiWith({
        investorDetail: vi.fn().mockRejectedValue(new ApiError(404, "no investor found")),
      }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("no investor found");
  });
});
