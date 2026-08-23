import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { InvestorDetailPage } from "../components/investor-detail-page";
import { INVESTOR_360_TABS } from "../components/admin/investor-360-tabs";
import type { InvestorDetailDto } from "../lib/api";
import { stubApi } from "./auth-panel.test";

const detail: InvestorDetailDto = {
  investor: {
    id: "sara-id",
    email: "sara@demo.com",
    emailVerified: true,
    kycState: "approved",
    eligibleForClaims: true,
  },
  chain: { identityAddress: "0xId1", walletAddress: "0xWallet1" },
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
  redemptions: [],
  crm: { stage: "active", tags: ["vip"], followUps: [] },
  sales: {
    subscriptions: [],
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
  },
  timeline: [],
};

const renderPage = () =>
  render(
    <InvestorDetailPage
      locale="en"
      api={stubApi({
        investorDetail: vi.fn().mockResolvedValue(detail),
        getApplicantOnboarding: vi.fn().mockResolvedValue(undefined),
        getApplicantAnswers: vi.fn().mockResolvedValue(undefined),
        investorScreenings: vi.fn().mockResolvedValue([]),
        investorRiskAssessments: vi.fn().mockResolvedValue([]),
        riskModel: vi.fn().mockResolvedValue({
          provisional: true,
          notice: "REQUIRES LOCAL LEGAL VALIDATION",
          thresholds: { medium: 3, high: 6 },
          factors: [],
        }),
      })}
      token="tok"
      investorId="sara-id"
      onBack={vi.fn()}
    />,
  );

// 4.3: the Investor 360. One person's whole file, organised so an officer can
// find the part they came for instead of scrolling past everything else.
describe("Investor 360 tabs", () => {
  it("opens on Overview, so the page still answers 'who is this' first", async () => {
    renderPage();

    const overview = await screen.findByRole("tab", { name: /overview/i });
    expect(overview.getAttribute("aria-selected")).toBe("true");
  });

  it("shows only the selected tab's panel", async () => {
    renderPage();
    await screen.findByRole("tab", { name: /overview/i });

    // Compliance content is not on screen until its tab is chosen.
    expect(screen.queryByText(/Sanctions & PEP screening/i)).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: /identity & compliance/i }));

    expect(await screen.findByText(/Sanctions & PEP screening/i)).toBeTruthy();
    expect(
      screen.getByRole("tab", { name: /identity & compliance/i }).getAttribute("aria-selected"),
    ).toBe("true");
  });

  it("keeps the person's identity visible on every tab, not just Overview", async () => {
    // An officer acting on the wrong file is the failure this prevents: the
    // heading and KYC state stay put while the tabs change underneath.
    renderPage();
    await screen.findByRole("tab", { name: /overview/i });

    fireEvent.click(screen.getByRole("tab", { name: /transfers/i }));

    expect(screen.getByRole("heading", { name: "sara@demo.com" })).toBeTruthy();
    expect(screen.getByText("Approved")).toBeTruthy();
  });

  it("offers no tab that nothing stands behind", () => {
    // The platform's rule is no dead nav. The IA names ten tabs; these are the
    // ones with real content today, and a tab must not appear before its
    // feature does — an empty "Cases" tab would claim a capability that does
    // not exist.
    expect(INVESTOR_360_TABS.map((tab) => tab.id)).toEqual([
      "overview",
      "compliance",
      "investments",
      "portfolio",
      "cash",
      "transfers",
      "communications",
    ]);
  });

  it("finds a holding under Portfolio, where an officer would look for it", async () => {
    renderPage();
    await screen.findByRole("tab", { name: /overview/i });

    fireEvent.click(screen.getByRole("tab", { name: /^portfolio$/i }));

    expect(await screen.findByText("Vanak Tower SPV")).toBeTruthy();
  });

  it("finds a transfer under Transfers", async () => {
    renderPage();
    await screen.findByRole("tab", { name: /overview/i });

    fireEvent.click(screen.getByRole("tab", { name: /transfers/i }));

    expect(await screen.findByText("bob@demo.com")).toBeTruthy();
  });
});
