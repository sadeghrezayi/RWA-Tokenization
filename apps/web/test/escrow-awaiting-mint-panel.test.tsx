import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { EscrowAwaitingMintPanel } from "../components/admin/escrow-awaiting-mint-panel";
import type { AllocationAwaitingMintDto, ApiClient } from "../lib/api";
import { stubApi } from "./auth-panel.test";

const stuck: AllocationAwaitingMintDto = {
  offeringId: "off-1",
  assetName: "Vanak Tower",
  investorId: "inv-1",
  investorEmail: "alice@example.com",
  tokens: "60",
  heldRial: "60000",
  since: "2026-08-20T09:00:00.000Z",
  mintState: "not_minted",
  retry: { status: "failed", attempts: 3, lastError: "holder not registered" },
};

const unresolved: AllocationAwaitingMintDto = {
  offeringId: "off-2",
  assetName: "Sa'adat Abad Block",
  investorId: "inv-2",
  investorEmail: "bob@example.com",
  tokens: "10",
  heldRial: "10000",
  since: "2026-08-21T09:00:00.000Z",
  mintState: "unresolved",
};

const renderPanel = (rows: AllocationAwaitingMintDto[], overrides: Partial<ApiClient> = {}) =>
  render(
    <EscrowAwaitingMintPanel
      locale="en"
      token="tok"
      api={stubApi({
        allocationsAwaitingMint: vi.fn().mockResolvedValue(rows),
        ...overrides,
      })}
    />,
  );

// K-34's residue made actionable. The health probe's count says something is
// wrong; this screen says WHOSE money, HOW MUCH, and WHY it is stuck.
//
// It offers no button. Releasing an investor's escrow needs a policy that does
// not exist yet — how long to wait and who may do it are unanswered — and a
// screen that invited the action before the rule existed would be worse than
// one that only tells the truth.
describe("EscrowAwaitingMintPanel", () => {
  it("names whose money is held, how much, and why it is stuck", async () => {
    renderPanel([stuck]);

    const row = await screen.findByTestId("awaiting-mint-0");
    expect(row.textContent).toContain("alice@example.com");
    expect(row.textContent).toContain("Vanak Tower");
    expect(row.textContent).toMatch(/60,000/);
    expect(row.textContent).toContain("holder not registered");
  });

  it("marks an UNRESOLVED allocation differently from one never minted", async () => {
    // These need opposite handling — one may already be on the chain — so the
    // screen must never render them as the same thing.
    renderPanel([stuck, unresolved]);

    const rows = await screen.findAllByTestId(/^awaiting-mint-\d+$/);
    const states = rows.map((r) => r.querySelector("[data-testid$='-state']")?.textContent ?? "");
    expect(states[0]).not.toBe(states[1]);
    expect(states.join(" ").toLowerCase()).toContain("unresolved");
  });

  it("says how much money is held in total, not just per row", async () => {
    // Two allocations holding 70,000 Rial between them is the number someone
    // decides on; making a person add up the rows invites getting it wrong.
    renderPanel([stuck, unresolved]);

    const total = await screen.findByTestId("awaiting-mint-total");
    expect(total.textContent).toMatch(/70,000/);
  });

  it("shows nothing owed when every allocation got its tokens", async () => {
    renderPanel([]);

    expect(await screen.findByTestId("awaiting-mint-empty")).toBeTruthy();
  });

  it("never renders a failed load as an empty, healthy list", async () => {
    // The most dangerous thing this screen could get wrong: "no stuck escrow"
    // and "we could not check" must never look the same.
    renderPanel([], {
      allocationsAwaitingMint: vi.fn().mockRejectedValue(new Error("upstream is down")),
    });

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.queryByTestId("awaiting-mint-empty")).toBeNull();
  });

  it("offers no release action, because no policy authorises one yet", async () => {
    renderPanel([stuck]);

    await screen.findByTestId("awaiting-mint-0");
    expect(screen.queryByRole("button", { name: /release/i })).toBeNull();
  });
});
