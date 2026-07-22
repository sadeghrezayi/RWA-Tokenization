import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AssetDetailPage } from "../components/asset-detail-page";
import { ApiError } from "../lib/api";
import type { ApiClient, AssetViewDto } from "../lib/api";

const structuring: AssetViewDto = {
  id: "asset-1",
  name: "Vanak Tower SPV",
  type: "asset_backed",
  state: "in_structuring",
  custody: { custodianName: "Melli Custody", location: "Tehran vault 7" },
  checklist: {
    confirmed: ["legal_right_clear"],
    unconfirmed: ["transferable", "valuation_current"],
  },
  dossier: {
    complete: false,
    missingKinds: ["counsel_signoff"],
    documents: [{ kind: "ownership_evidence", title: "Deed", cid: "bafyDeed", sha256: "abc123" }],
  },
};

const tokenized: AssetViewDto = {
  id: "asset-1",
  name: "Vanak Tower SPV",
  type: "asset_backed",
  state: "tokenized",
  tokenAddress: "0x90b9e83e22afa2e6a96b3549a0e495d5bae61af",
  custody: { custodianName: "Melli Custody", location: "Tehran vault 7" },
  checklist: { confirmed: ["legal_right_clear", "transferable"], unconfirmed: [] },
  dossier: { complete: true, missingKinds: [], documents: [] },
};

const apiWith = (asset: AssetViewDto, overrides: Partial<ApiClient> = {}): ApiClient =>
  ({
    getAsset: vi.fn().mockResolvedValue(asset),
    startStructuring: vi.fn().mockResolvedValue(undefined),
    attachAssetDocument: vi.fn().mockResolvedValue({ cid: "c", sha256: "s" }),
    recordCustody: vi.fn().mockResolvedValue(undefined),
    confirmChecklistItem: vi.fn().mockResolvedValue(undefined),
    approveAsset: vi.fn().mockResolvedValue(undefined),
    tokenizeAsset: vi.fn().mockResolvedValue({ tokenAddress: "0xTok" }),
    ...overrides,
  }) as ApiClient;

const renderPage = (api: ApiClient) =>
  render(<AssetDetailPage locale="en" api={api} token="tok" assetId="asset-1" onBack={vi.fn()} />);

describe("AssetDetailPage", () => {
  it("loads_and_shows_the_dossier_custody_and_checklist", async () => {
    const getAsset = vi.fn().mockResolvedValue(structuring);
    renderPage(apiWith(structuring, { getAsset }));

    expect(await screen.findByRole("heading", { name: "Vanak Tower SPV" })).toBeInTheDocument();
    expect(getAsset).toHaveBeenCalledWith("tok", "asset-1");
    expect(screen.getByText("Deed")).toBeInTheDocument(); // dossier doc
    expect(screen.getByText("Melli Custody")).toBeInTheDocument(); // custody
    expect(screen.getByText(/legal_right_clear/)).toBeInTheDocument(); // confirmed checklist
  });

  it("confirms_an_unconfirmed_checklist_item", async () => {
    const confirmChecklistItem = vi.fn().mockResolvedValue(undefined);
    renderPage(apiWith(structuring, { confirmChecklistItem }));
    await screen.findByRole("heading", { name: "Vanak Tower SPV" });

    await userEvent.click(screen.getByRole("button", { name: "transferable" }));

    await waitFor(() => {
      expect(confirmChecklistItem).toHaveBeenCalledWith("tok", "asset-1", "transferable");
    });
  });

  it("attaches_a_dossier_document", async () => {
    const attachAssetDocument = vi.fn().mockResolvedValue({ cid: "c", sha256: "s" });
    renderPage(apiWith(structuring, { attachAssetDocument }));
    await screen.findByRole("heading", { name: "Vanak Tower SPV" });

    await userEvent.type(screen.getByLabelText("Document title"), "Counsel sign-off");
    await userEvent.click(screen.getByRole("button", { name: "Attach document" }));

    await waitFor(() => {
      expect(attachAssetDocument).toHaveBeenCalledWith(
        "tok",
        "asset-1",
        expect.objectContaining({ title: "Counsel sign-off" }),
      );
    });
  });

  it("approves_a_structuring_asset", async () => {
    const approveAsset = vi.fn().mockResolvedValue(undefined);
    renderPage(apiWith(structuring, { approveAsset }));
    await screen.findByRole("heading", { name: "Vanak Tower SPV" });

    await userEvent.click(screen.getByRole("button", { name: "Approve asset" }));

    await waitFor(() => {
      expect(approveAsset).toHaveBeenCalledWith("tok", "asset-1");
    });
  });

  it("shows_the_token_address_for_a_tokenized_asset_and_no_workflow", async () => {
    renderPage(apiWith(tokenized));
    await screen.findByRole("heading", { name: "Vanak Tower SPV" });

    expect(screen.getByText("Tokenized")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve asset" })).not.toBeInTheDocument();
    expect(screen.getByText(/0x90b9/)).toBeInTheDocument();
  });

  it("tokenizes_an_approved_asset_via_the_symbol_form", async () => {
    const approved: AssetViewDto = {
      id: tokenized.id,
      name: tokenized.name,
      type: tokenized.type,
      state: "approved",
      checklist: tokenized.checklist,
      dossier: tokenized.dossier,
      ...(tokenized.custody ? { custody: tokenized.custody } : {}),
    };
    const tokenizeAsset = vi.fn().mockResolvedValue({ tokenAddress: "0xTok" });
    renderPage(apiWith(approved, { tokenizeAsset }));
    await screen.findByRole("heading", { name: "Vanak Tower SPV" });

    await userEvent.type(screen.getByLabelText("Token symbol"), "vanak");
    await userEvent.click(screen.getByRole("button", { name: "Tokenize asset" }));

    await waitFor(() => {
      expect(tokenizeAsset).toHaveBeenCalledWith("tok", "asset-1", "VANAK");
    });
  });

  it("surfaces_a_load_error", async () => {
    renderPage(
      apiWith(structuring, {
        getAsset: vi.fn().mockRejectedValue(new ApiError(404, "no asset found")),
      }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("no asset found");
  });
});
