import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { IssuerAssets } from "../components/issuer/issuer-assets";
import type { AssetViewDto } from "../lib/api";
import { stubApi } from "./auth-panel.test";

const asset = (over: Partial<AssetViewDto> = {}): AssetViewDto => ({
  id: "asset-1",
  name: "Vanak Tower Floor 7",
  type: "real_estate",
  state: "proposed",
  checklist: { confirmed: [], unconfirmed: [] },
  dossier: { complete: false, missingKinds: ["ownership_evidence"], documents: [] },
  rights: [],
  organisationId: "org-1",
  organisationName: "Vanak Property Holdings PJSC",
  ...over,
});

const renderAssets = (rows: AssetViewDto[] | Error) =>
  render(
    <IssuerAssets
      locale="en"
      organisationId="org-1"
      api={stubApi({
        issuerAssets:
          rows instanceof Error ? vi.fn().mockRejectedValue(rows) : vi.fn().mockResolvedValue(rows),
      })}
    />,
  );

describe("IssuerAssets", () => {
  it("lists the assets this organisation brought, with where each one stands", async () => {
    renderAssets([asset(), asset({ id: "asset-2", name: "Elahiyeh Block C", state: "approved" })]);

    expect((await screen.findByTestId("issuer-asset-asset-1")).textContent).toContain(
      "Vanak Tower Floor 7",
    );
    const second = await screen.findByTestId("issuer-asset-asset-2");
    expect(second.textContent).toContain("Elahiyeh Block C");
    expect(second.textContent).toContain("Approved");
  });

  it("says plainly that nothing has been brought yet, rather than showing an empty table", async () => {
    renderAssets([]);

    expect(await screen.findByTestId("no-issuer-assets")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });

  // A refusal and an empty list mean opposite things: one says "you have
  // brought nothing", the other says "we could not ask on your behalf".
  it("shows a refusal as a refusal, not as an empty list", async () => {
    renderAssets(new Error("forbidden"));

    expect((await screen.findByRole("alert")).textContent).toContain("forbidden");
    expect(screen.queryByTestId("no-issuer-assets")).toBeNull();
  });

  it("waits visibly instead of flashing an empty state before the answer arrives", () => {
    renderAssets([asset()]);

    expect(screen.getByTestId("issuer-assets-loading")).toBeTruthy();
    expect(screen.queryByTestId("no-issuer-assets")).toBeNull();
  });
});
