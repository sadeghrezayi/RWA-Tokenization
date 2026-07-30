import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import { PublicCatalog } from "../components/public/public-catalog";
import { PublicOfferingDetail } from "../components/public/public-offering-detail";
import { ApiError } from "../lib/api";
import type { PublicOfferingDto } from "../lib/api";
import { stubApi } from "./auth-panel.test";

const offering = (overrides: Partial<PublicOfferingDto> = {}): PublicOfferingDto => ({
  id: "off-1",
  assetId: "asset-1",
  assetName: "Vanak Tower",
  supply: "100",
  priceRial: "1000000",
  minPerInvestor: "1",
  maxPerInvestor: "50",
  opensAt: "2026-07-01T00:00:00.000Z",
  closesAt: "2026-08-10T00:00:00.000Z",
  publishedAt: "2026-07-02T00:00:00.000Z",
  ...overrides,
});

describe("PublicCatalog", () => {
  it("lists published offerings by their human name", async () => {
    const api = stubApi({
      publicOfferings: vi
        .fn()
        .mockResolvedValue([offering(), offering({ id: "off-2", assetName: "Sadr Plaza" })]),
    });
    render(<PublicCatalog locale="en" api={api} />);

    expect(await screen.findByText("Vanak Tower")).toBeInTheDocument();
    expect(screen.getByText("Sadr Plaza")).toBeInTheDocument();
  });

  it("links each offering to its public detail page", async () => {
    const api = stubApi({ publicOfferings: vi.fn().mockResolvedValue([offering()]) });
    render(<PublicCatalog locale="en" api={api} />);

    const link = await screen.findByRole("link", { name: /Vanak Tower/ });
    expect(link).toHaveAttribute("href", "/en/browse/off-1");
  });

  it("says so plainly when nothing is currently offered", async () => {
    const api = stubApi({ publicOfferings: vi.fn().mockResolvedValue([]) });
    render(<PublicCatalog locale="en" api={api} />);

    expect(await screen.findByText(/No offerings are open/i)).toBeInTheDocument();
  });

  it("shows an error instead of an empty catalog when the load fails", async () => {
    const api = stubApi({ publicOfferings: vi.fn().mockRejectedValue(new Error("down")) });
    render(<PublicCatalog locale="en" api={api} />);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
    // "No offerings" would be a lie when we simply could not read the catalog.
    expect(screen.queryByText(/No offerings are open/i)).not.toBeInTheDocument();
  });
});

describe("PublicOfferingDetail", () => {
  it("shows the factual terms a visitor needs", async () => {
    const api = stubApi({ publicOffering: vi.fn().mockResolvedValue(offering()) });
    render(<PublicOfferingDetail locale="en" api={api} offeringId="off-1" />);

    expect(await screen.findByText("Vanak Tower")).toBeInTheDocument();
    const terms = within(screen.getByTestId("offering-terms"));
    expect(terms.getByText(/1,000,000/)).toBeInTheDocument(); // price per token
    expect(terms.getByText("100")).toBeInTheDocument(); // supply
  });

  it("never renders a projected return (OD-21)", async () => {
    const api = stubApi({ publicOffering: vi.fn().mockResolvedValue(offering()) });
    render(<PublicOfferingDetail locale="en" api={api} offeringId="off-1" />);

    await screen.findByText("Vanak Tower");
    expect(screen.queryByText(/projected/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/expected return/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/guaranteed/i)).not.toBeInTheDocument();
  });

  it("carries a risk notice, since this is a public investment page", async () => {
    const api = stubApi({ publicOffering: vi.fn().mockResolvedValue(offering()) });
    render(<PublicOfferingDetail locale="en" api={api} offeringId="off-1" />);

    expect(await screen.findByTestId("risk-notice")).toBeInTheDocument();
  });

  it("treats an unlisted offering as simply not found", async () => {
    const api = stubApi({
      publicOffering: vi.fn().mockRejectedValue(new ApiError(404, "offering not found")),
    });
    render(<PublicOfferingDetail locale="en" api={api} offeringId="off-private" />);

    expect(await screen.findByText(/not available/i)).toBeInTheDocument();
  });
});
