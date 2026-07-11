import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AssetsPanel } from "../components/assets-panel";
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
    startStructuring: vi.fn().mockResolvedValue(undefined),
    attachAssetDocument: vi.fn().mockResolvedValue({ cid: "c", sha256: "a".repeat(64) }),
    recordCustody: vi.fn().mockResolvedValue(undefined),
    confirmChecklistItem: vi.fn().mockResolvedValue(undefined),
    approveAsset: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }) as ApiClient;

describe("AssetsPanel", () => {
  it("lists_assets_with_state_and_missing_dossier_kinds", async () => {
    const api = apiWith({ listAssets: vi.fn().mockResolvedValue([asset({})]) });
    render(<AssetsPanel locale="en" api={api} token="tok" />);

    expect(await screen.findByText("Pilot Real Estate SPV")).toBeInTheDocument();
    expect(screen.getByText("proposed")).toBeInTheDocument();
    expect(screen.getByText(/ownership_evidence/)).toBeInTheDocument();
  });

  it("proposes_an_asset_and_refreshes_the_list", async () => {
    const listAssets = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([asset({})]);
    const proposeAsset = vi.fn().mockResolvedValue({ assetId: "asset-1" });
    render(<AssetsPanel locale="en" api={apiWith({ listAssets, proposeAsset })} token="tok" />);

    await userEvent.type(await screen.findByLabelText("Asset name"), "Pilot Real Estate SPV");
    await userEvent.click(screen.getByRole("button", { name: "Propose asset" }));

    await waitFor(() => {
      expect(proposeAsset).toHaveBeenCalledWith("tok", "Pilot Real Estate SPV");
    });
    expect(await screen.findByText("Pilot Real Estate SPV")).toBeInTheDocument();
  });

  it("confirms_checklist_items_and_approves_during_structuring", async () => {
    const structuring = asset({ state: "in_structuring" });
    const confirmChecklistItem = vi.fn().mockResolvedValue(undefined);
    const approveAsset = vi.fn().mockResolvedValue(undefined);
    const api = apiWith({
      listAssets: vi.fn().mockResolvedValue([structuring]),
      confirmChecklistItem,
      approveAsset,
    });
    render(<AssetsPanel locale="en" api={api} token="tok" />);

    await userEvent.click(await screen.findByRole("button", { name: "legal_right_clear" }));
    await waitFor(() => {
      expect(confirmChecklistItem).toHaveBeenCalledWith("tok", "asset-1", "legal_right_clear");
    });

    await userEvent.click(screen.getByRole("button", { name: "Approve asset" }));
    await waitFor(() => {
      expect(approveAsset).toHaveBeenCalledWith("tok", "asset-1");
    });
  });

  it("shows_the_api_error_when_an_action_fails", async () => {
    const { ApiError } = await import("../lib/api");
    const api = apiWith({
      listAssets: vi.fn().mockResolvedValue([asset({ state: "in_structuring" })]),
      approveAsset: vi.fn().mockRejectedValue(new ApiError(409, "dossier missing")),
    });
    render(<AssetsPanel locale="en" api={api} token="tok" />);

    await userEvent.click(await screen.findByRole("button", { name: "Approve asset" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("dossier missing");
  });
});
