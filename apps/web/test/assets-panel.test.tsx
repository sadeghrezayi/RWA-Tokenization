import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AssetsPanel } from "../components/assets-panel";
import { ApiError } from "../lib/api";
import type { ApiClient, AssetViewDto } from "../lib/api";

const asset = (overrides: Partial<AssetViewDto>): AssetViewDto => ({
  id: "asset-1",
  name: "Pilot Real Estate SPV",
  type: "asset_backed",
  state: "proposed",
  rights: [],
  checklist: { confirmed: [], unconfirmed: ["legal_right_clear"] },
  dossier: { complete: false, missingKinds: ["ownership_evidence"], documents: [] },
  ...overrides,
});

const approvedIssuer = {
  id: "org-1",
  legalName: "Vanak Property Holdings PJSC",
  registrationNumber: "IR-448120",
  contactEmail: "ops@vanak.example",
  state: "approved" as const,
  appliedAt: "2026-08-15T09:00:00.000Z",
  canSubmitAssets: true,
};

const unapprovedIssuer = {
  ...approvedIssuer,
  id: "org-2",
  legalName: "Not Yet Approved Ltd",
  state: "applied" as const,
  canSubmitAssets: false,
};

const apiWith = (overrides: Partial<ApiClient>): ApiClient =>
  ({
    listAssets: vi.fn().mockResolvedValue([]),
    proposeAsset: vi.fn().mockResolvedValue({ assetId: "asset-1" }),
    issuers: vi.fn().mockResolvedValue([approvedIssuer, unapprovedIssuer]),
    ...overrides,
  }) as ApiClient;

describe("AssetsPanel", () => {
  it("lists_assets_with_state_and_dossier_progress", async () => {
    const api = apiWith({ listAssets: vi.fn().mockResolvedValue([asset({})]) });
    render(<AssetsPanel locale="en" api={api} token="tok" onOpenAsset={vi.fn()} />);

    expect(await screen.findByText("Pilot Real Estate SPV")).toBeInTheDocument();
    expect(screen.getByText("Proposed")).toBeInTheDocument();
  });

  it("navigates_to_the_detail_page_when_a_row_is_opened", async () => {
    const onOpenAsset = vi.fn();
    const api = apiWith({ listAssets: vi.fn().mockResolvedValue([asset({})]) });
    render(<AssetsPanel locale="en" api={api} token="tok" onOpenAsset={onOpenAsset} />);
    await screen.findByText("Pilot Real Estate SPV");

    await userEvent.click(
      within(screen.getByTestId("asset-asset-1")).getByRole("button", { name: "Open" }),
    );

    expect(onOpenAsset).toHaveBeenCalledWith("asset-1");
  });

  it("proposes_an_asset_and_opens_its_page", async () => {
    const onOpenAsset = vi.fn();
    const proposeAsset = vi.fn().mockResolvedValue({ assetId: "asset-9" });
    render(
      <AssetsPanel
        locale="en"
        api={apiWith({ proposeAsset })}
        token="tok"
        onOpenAsset={onOpenAsset}
      />,
    );

    await userEvent.type(await screen.findByLabelText("Asset name"), "Pilot Real Estate SPV");
    await userEvent.click(screen.getByRole("button", { name: "Propose asset" }));

    await waitFor(() => {
      // The third argument is the issuer; undefined means the platform brought it.
      expect(proposeAsset).toHaveBeenCalledWith("tok", "Pilot Real Estate SPV", undefined);
    });
    expect(onOpenAsset).toHaveBeenCalledWith("asset-9");
  });

  it("shows_the_token_address_of_a_tokenized_asset", async () => {
    const tokenized = asset({ state: "tokenized", tokenAddress: "0xAbc123def456" });
    const api = apiWith({ listAssets: vi.fn().mockResolvedValue([tokenized]) });
    render(<AssetsPanel locale="en" api={api} token="tok" onOpenAsset={vi.fn()} />);

    expect(await screen.findByText("Tokenized")).toBeInTheDocument();
    expect(screen.getByText(/0xAbc1/)).toBeInTheDocument();
  });

  it("shows_the_api_error_when_the_list_fails", async () => {
    const api = apiWith({
      listAssets: vi.fn().mockRejectedValue(new ApiError(403, "officer role required")),
    });
    render(<AssetsPanel locale="en" api={api} token="tok" onOpenAsset={vi.fn()} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("officer role required");
  });

  // 3.3: an officer can say which approved issuer brought the asset. Leaving it
  // as the platform is a first-class choice, not an empty field.
  it("offers only the issuers that may actually submit assets", async () => {
    render(<AssetsPanel locale="en" api={apiWith({})} token="tok" onOpenAsset={vi.fn()} />);

    const select = await screen.findByLabelText(/issuer/i);
    expect(within(select).getByRole("option", { name: /Vanak Property Holdings/ })).toBeTruthy();
    // An organisation the platform has not approved would be refused by the
    // server, so it is never offered.
    expect(within(select).queryByRole("option", { name: /Not Yet Approved/ })).toBeNull();
  });

  it("proposes an asset for the chosen issuer", async () => {
    const proposeAsset = vi.fn().mockResolvedValue({ assetId: "asset-9" });
    render(
      <AssetsPanel locale="en" api={apiWith({ proposeAsset })} token="tok" onOpenAsset={vi.fn()} />,
    );

    await userEvent.type(await screen.findByLabelText(/name/i), "Vanak Villa");
    await userEvent.selectOptions(await screen.findByLabelText(/issuer/i), "org-1");
    await userEvent.click(screen.getByRole("button", { name: /propose/i }));

    await waitFor(() => {
      expect(proposeAsset).toHaveBeenCalledWith("tok", "Vanak Villa", "org-1");
    });
  });

  it("proposes a platform-onboarded asset when no issuer is chosen", async () => {
    const proposeAsset = vi.fn().mockResolvedValue({ assetId: "asset-9" });
    render(
      <AssetsPanel locale="en" api={apiWith({ proposeAsset })} token="tok" onOpenAsset={vi.fn()} />,
    );

    await userEvent.type(await screen.findByLabelText(/name/i), "Platform Villa");
    await userEvent.click(screen.getByRole("button", { name: /propose/i }));

    await waitFor(() => {
      // No third argument: the platform brought this one.
      expect(proposeAsset).toHaveBeenCalledWith("tok", "Platform Villa", undefined);
    });
  });

  it("still proposes assets when the issuer list cannot be read", async () => {
    // A role with asset.manage but not issuer.manage gets a 403 here. That must
    // not take the whole screen down — it just means no issuer can be chosen.
    const proposeAsset = vi.fn().mockResolvedValue({ assetId: "asset-9" });
    render(
      <AssetsPanel
        locale="en"
        api={apiWith({
          proposeAsset,
          issuers: vi.fn().mockRejectedValue(new ApiError(403, "requires issuer.manage")),
        })}
        token="tok"
        onOpenAsset={vi.fn()}
      />,
    );

    await userEvent.type(await screen.findByLabelText(/name/i), "Platform Villa");
    await userEvent.click(screen.getByRole("button", { name: /propose/i }));

    await waitFor(() => {
      expect(proposeAsset).toHaveBeenCalledWith("tok", "Platform Villa", undefined);
    });
    expect(screen.queryByLabelText(/issuer/i)).toBeNull();
  });

  it("names the issuer that brought an asset in the list", async () => {
    const api = apiWith({
      listAssets: vi
        .fn()
        .mockResolvedValue([
          asset({ organisationId: "org-1", organisationName: "Vanak Property Holdings PJSC" }),
        ]),
    });
    render(<AssetsPanel locale="en" api={api} token="tok" onOpenAsset={vi.fn()} />);

    const row = await screen.findByTestId("asset-asset-1");
    expect(row.textContent).toContain("Vanak Property Holdings PJSC");
  });
});
