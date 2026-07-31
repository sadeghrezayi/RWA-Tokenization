import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { PublicCatalog } from "../components/public/public-catalog";
import { PublicOfferingDetail } from "../components/public/public-offering-detail";
import type { PublicOfferingDto } from "../lib/api";

// 2.2: these are now PURE presentational components — the server page fetches
// and passes data in, so a crawler receives real HTML. `undefined` means the
// fetch failed (or the offering is not listed), which must never render as
// "nothing on offer".
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
  it("lists published offerings by their human name", () => {
    render(
      <PublicCatalog
        locale="en"
        offerings={[offering(), offering({ id: "off-2", assetName: "Sadr Plaza" })]}
      />,
    );

    expect(screen.getByText("Vanak Tower")).toBeInTheDocument();
    expect(screen.getByText("Sadr Plaza")).toBeInTheDocument();
  });

  it("links each offering to its public detail page", () => {
    render(<PublicCatalog locale="en" offerings={[offering()]} />);
    expect(screen.getByRole("link", { name: /Vanak Tower/ })).toHaveAttribute(
      "href",
      "/en/browse/off-1",
    );
  });

  it("says so plainly when nothing is currently offered", () => {
    render(<PublicCatalog locale="en" offerings={[]} />);
    expect(screen.getByText(/No offerings are open/i)).toBeInTheDocument();
  });

  it("shows an error instead of an empty catalog when the load failed", () => {
    render(<PublicCatalog locale="en" offerings={undefined} />);

    expect(screen.getByRole("alert")).toBeInTheDocument();
    // "No offerings" would be a lie when we simply could not read the catalog.
    expect(screen.queryByText(/No offerings are open/i)).not.toBeInTheDocument();
  });
});

describe("PublicOfferingDetail", () => {
  it("shows the factual terms a visitor needs", () => {
    render(<PublicOfferingDetail locale="en" offering={offering()} />);

    expect(screen.getByText("Vanak Tower")).toBeInTheDocument();
    const terms = within(screen.getByTestId("offering-terms"));
    expect(terms.getByText(/1,000,000/)).toBeInTheDocument();
    expect(terms.getByText("100")).toBeInTheDocument();
  });

  it("never renders a projected return (OD-21)", () => {
    render(<PublicOfferingDetail locale="en" offering={offering()} />);

    expect(screen.queryByText(/projected/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/expected return/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/guaranteed/i)).not.toBeInTheDocument();
  });

  it("carries a risk notice, since this is a public investment page", () => {
    render(<PublicOfferingDetail locale="en" offering={offering()} />);
    expect(screen.getByTestId("risk-notice")).toBeInTheDocument();
  });

  it("treats an unlisted offering as simply not found", () => {
    render(<PublicOfferingDetail locale="en" offering={undefined} />);
    expect(screen.getByText(/not available/i)).toBeInTheDocument();
  });
});
