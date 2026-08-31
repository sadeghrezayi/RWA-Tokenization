import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

const renderPanel = (
  rows: AllocationAwaitingMintDto[],
  overrides: Partial<ApiClient> = {},
  canRelease = false,
) =>
  render(
    <EscrowAwaitingMintPanel
      locale="en"
      token="tok"
      canRelease={canRelease}
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

// P0-2 step 3's residue finally has one lever, and this screen is where it is
// pulled. The three rules it enforces are all about NOT offering the action
// where it would be wrong.
describe("EscrowAwaitingMintPanel — returning stranded money", () => {
  it("offers no release control to someone who may not move money", async () => {
    // The auditor can SEE stranded escrow — that is the point of the screen —
    // and must not be handed a button that would 403.
    renderPanel([stuck], {}, false);
    await screen.findByTestId("awaiting-mint-0");

    expect(screen.queryByTestId("release-escrow-0")).toBeNull();
  });

  it("offers it for an allocation whose tokens were never minted", async () => {
    renderPanel([stuck], {}, true);

    expect(await screen.findByTestId("release-escrow-0")).toBeTruthy();
  });

  it("does NOT offer it for an UNRESOLVED mint, and says why", async () => {
    // Mirrors the server's refusal. A button that always fails is worse than
    // no button — it teaches an operator that the screen is unreliable.
    renderPanel([unresolved], {}, true);
    await screen.findByTestId("awaiting-mint-0");

    expect(screen.queryByTestId("release-escrow-0")).toBeNull();
    expect(screen.getByText(/nobody knows whether the tokens exist/i)).toBeTruthy();
  });

  it("refuses to submit without a reason", async () => {
    const releaseStrandedEscrow = vi.fn().mockResolvedValue(undefined);
    renderPanel([stuck], { releaseStrandedEscrow }, true);

    (await screen.findByTestId("release-escrow-0")).click();

    expect(releaseStrandedEscrow).not.toHaveBeenCalled();
    expect(await screen.findByRole("alert")).toBeTruthy();
  });

  it("sends the offering, the investor and the reason", async () => {
    const releaseStrandedEscrow = vi.fn().mockResolvedValue(undefined);
    renderPanel([stuck], { releaseStrandedEscrow }, true);

    const reason = await screen.findByTestId("release-reason-0");
    fireEvent.change(reason, { target: { value: "six days stuck, holder asked" } });
    (await screen.findByTestId("release-escrow-0")).click();

    await waitFor(() => {
      expect(releaseStrandedEscrow).toHaveBeenCalledWith(
        "tok",
        "off-1",
        "inv-1",
        "six days stuck, holder asked",
      );
    });
  });
});
