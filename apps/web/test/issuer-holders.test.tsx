import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { IssuerHolders } from "../components/issuer/issuer-holders";
import type { ApiClient, IssuerHoldersDto } from "../lib/api";
import { stubApi } from "./auth-panel.test";

const view: IssuerHoldersDto = {
  assetId: "asset-1",
  assetName: "Vanak Tower",
  holders: [
    {
      holderReference: "a1b2c3d4e5f60718",
      tokens: "60",
      shareBps: 6_000,
      holderSince: "2026-08-20T09:00:00.000Z",
      tokensAllocated: "60",
      amountInvestedRial: "60000",
      amountRefundedRial: "5000",
      allocationDate: "2026-08-20T09:00:00.000Z",
    },
    {
      // A holder the platform cannot name — no allocation on record.
      holderReference: "9f8e7d6c5b4a3928",
      tokens: "40",
      shareBps: 4_000,
      holderSince: "2026-08-21T09:00:00.000Z",
    },
  ],
};

const renderPanel = (dto: IssuerHoldersDto, overrides: Partial<ApiClient> = {}) =>
  render(
    <IssuerHolders
      locale="en"
      organisationId="org-1"
      assetId="asset-1"
      token="tok"
      api={stubApi({
        issuerAssetHolders: vi.fn().mockResolvedValue(dto),
        ...overrides,
      })}
    />,
  );

// P1-2 / FR-PT-2. The screen where an issuer meets their own cap table.
//
// Its most important property is what it CANNOT show: the endpoint never sends
// an identity, so there is nothing here to leak. The tests below assert the
// screen does not invent one — a "contact holder" affordance or a mailto would
// be a promise the platform deliberately does not keep.
describe("IssuerHolders", () => {
  it("shows each holder's stake and what they put in", async () => {
    renderPanel(view);

    const row = await screen.findByTestId("issuer-holder-0");
    expect(row.textContent).toContain("a1b2c3d4");
    expect(row.textContent).toMatch(/60/);
    // 6000 bps rendered as a percentage a person reads, not raw basis points.
    expect(row.textContent).toMatch(/60(\.0)?\s*%/);
    expect(row.textContent).toMatch(/60,000/);
  });

  it("shows a holder with no allocation on record without inventing a zero", async () => {
    // Zero invested and unknown are different claims, and an issuer reading a
    // cap table would act differently on each.
    renderPanel(view);

    const row = await screen.findByTestId("issuer-holder-1");
    expect(row.textContent).toContain("9f8e7d6c");
    expect(row.textContent).not.toMatch(/0\s*Rial|Rial\s*0/);
  });

  it("offers no way to contact or identify a holder", async () => {
    renderPanel(view);
    await screen.findByTestId("issuer-holder-0");

    expect(screen.queryByRole("link", { name: /email|contact/i })).toBeNull();
    expect(document.body.innerHTML).not.toContain("mailto:");
  });

  it("says plainly that identities are withheld, rather than leaving it a mystery", async () => {
    // An issuer who does not understand WHY there is no name will ask support
    // for one. Saying it on the screen is cheaper than answering that twice.
    renderPanel(view);

    expect(await screen.findByText(/does not disclose their identity/i)).toBeTruthy();
  });

  it("explains an empty registry instead of showing a bare table", async () => {
    renderPanel({ ...view, holders: [] });

    expect(await screen.findByTestId("issuer-holders-empty")).toBeTruthy();
  });

  it("never renders a failed load as an empty cap table", async () => {
    // "Nobody holds this" and "we could not load it" must never look alike.
    renderPanel(view, {
      issuerAssetHolders: vi.fn().mockRejectedValue(new Error("upstream is down")),
    });

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.queryByTestId("issuer-holders-empty")).toBeNull();
  });
});
