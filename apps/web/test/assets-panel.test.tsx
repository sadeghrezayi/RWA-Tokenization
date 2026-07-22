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
  checklist: { confirmed: [], unconfirmed: ["legal_right_clear"] },
  dossier: { complete: false, missingKinds: ["ownership_evidence"], documents: [] },
  ...overrides,
});

const apiWith = (overrides: Partial<ApiClient>): ApiClient =>
  ({
    listAssets: vi.fn().mockResolvedValue([]),
    proposeAsset: vi.fn().mockResolvedValue({ assetId: "asset-1" }),
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
      expect(proposeAsset).toHaveBeenCalledWith("tok", "Pilot Real Estate SPV");
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
});
