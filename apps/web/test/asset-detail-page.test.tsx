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
  rights: [],
  custody: { custodianName: "Melli Custody", location: "Tehran vault 7" },
  checklist: {
    confirmed: ["legal_right_clear"],
    unconfirmed: ["transferable", "valuation_current"],
  },
  dossier: {
    complete: false,
    missingKinds: ["counsel_signoff"],
    documents: [
      {
        kind: "ownership_evidence",
        title: "Deed",
        cid: "bafyDeed",
        sha256: "abc123",
        investorVisible: false,
      },
    ],
  },
};

const tokenized: AssetViewDto = {
  id: "asset-1",
  name: "Vanak Tower SPV",
  type: "asset_backed",
  state: "tokenized",
  rights: [],
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

  // K-33: this test used to assert the TITLE only, which is how the screen got
  // away with sending `btoa(`${title} placeholder content`)` as the document
  // for two months. The dossier is the evidence a token is backed by anything;
  // what matters is that the bytes are the file's.
  it("attaches_a_dossier_document", async () => {
    const attachAssetDocument = vi.fn().mockResolvedValue({ cid: "c", sha256: "s" });
    renderPage(apiWith(structuring, { attachAssetDocument }));
    await screen.findByRole("heading", { name: "Vanak Tower SPV" });

    const deed = new File(["the actual deed bytes"], "deed.pdf", { type: "application/pdf" });
    await userEvent.type(screen.getByLabelText("Document title"), "Counsel sign-off");
    await userEvent.upload(screen.getByLabelText(/file/i), deed);
    await userEvent.click(screen.getByRole("button", { name: "Attach document" }));

    await waitFor(() => {
      expect(attachAssetDocument).toHaveBeenCalledWith(
        "tok",
        "asset-1",
        expect.objectContaining({
          title: "Counsel sign-off",
          contentBase64: btoa("the actual deed bytes"),
        }),
      );
    });
  });

  it("will not attach a document when no file has been chosen", async () => {
    const attachAssetDocument = vi.fn();
    renderPage(apiWith(structuring, { attachAssetDocument }));
    await screen.findByRole("heading", { name: "Vanak Tower SPV" });

    await userEvent.type(screen.getByLabelText("Document title"), "A title with nothing behind it");
    await userEvent.click(screen.getByRole("button", { name: "Attach document" }));

    // A dossier entry with no document is worse than a missing one: it marks
    // the requirement satisfied.
    expect(attachAssetDocument).not.toHaveBeenCalled();
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
      rights: [],
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

// 2.5d: the operator decides, one document at a time, what a holder may read.
describe("AssetDetailPage document disclosure", () => {
  const withDocs = (investorVisible: boolean): AssetViewDto => ({
    ...tokenized,
    dossier: {
      complete: true,
      missingKinds: [],
      documents: [
        {
          kind: "valuation_report",
          title: "Valuation report",
          cid: "bafyVal",
          sha256: "d1",
          investorVisible,
        },
      ],
    },
  });

  it("says plainly whether holders can see a document", async () => {
    renderPage(apiWith(withDocs(false)));

    expect(await screen.findByText(/hidden from holders/i)).toBeTruthy();
  });

  it("publishes a document to holders on request", async () => {
    const setDocumentVisibility = vi.fn().mockResolvedValue(undefined);
    renderPage(apiWith(withDocs(false), { setDocumentVisibility }));

    await userEvent.click(await screen.findByRole("button", { name: /show to holders/i }));

    await waitFor(() => {
      expect(setDocumentVisibility).toHaveBeenCalledWith(
        "tok",
        "asset-1",
        "valuation_report",
        true,
      );
    });
  });

  it("takes a disclosure back", async () => {
    const setDocumentVisibility = vi.fn().mockResolvedValue(undefined);
    renderPage(apiWith(withDocs(true), { setDocumentVisibility }));

    await userEvent.click(await screen.findByRole("button", { name: /hide from holders/i }));

    await waitFor(() => {
      expect(setDocumentVisibility).toHaveBeenCalledWith(
        "tok",
        "asset-1",
        "valuation_report",
        false,
      );
    });
  });

  it("surfaces a refusal instead of pretending the switch moved", async () => {
    renderPage(
      apiWith(withDocs(false), {
        setDocumentVisibility: vi
          .fn()
          .mockRejectedValue(new ApiError(409, "the dossier holds no such document")),
      }),
    );

    await userEvent.click(await screen.findByRole("button", { name: /show to holders/i }));

    expect((await screen.findByRole("alert")).textContent).toContain("no such document");
  });
});

// 3.1: the officer's view of what this token is issued against and what it
// conveys — the platform's central claim, made visible.
describe("AssetDetailPage property and rights", () => {
  const withProfile = (): AssetViewDto => ({
    ...structuring,
    realEstate: {
      addressLine: "Plot 14, Vanak Street",
      city: "Tehran",
      propertyType: "residential",
      areaSquareMetres: 240,
      titleReference: "TR-1990-4471",
      builtInYear: 1998,
    },
    rights: [{ kind: "income", note: "Net rental income, quarterly, clause 7.2" }],
  });

  it("shows the property a token is issued against", async () => {
    renderPage(apiWith(withProfile()));

    expect(await screen.findByText("Plot 14, Vanak Street")).toBeTruthy();
    expect(screen.getByText("TR-1990-4471")).toBeTruthy();
  });

  it("says no property is recorded rather than showing an empty box", async () => {
    renderPage(apiWith(structuring));

    expect(await screen.findByText(/no property recorded/i)).toBeTruthy();
  });

  it("records a property from the form", async () => {
    const recordRealEstateProfile = vi.fn().mockResolvedValue(undefined);
    renderPage(apiWith(structuring, { recordRealEstateProfile }));

    await userEvent.type(await screen.findByLabelText("Address"), "Plot 14");
    await userEvent.type(screen.getByLabelText("City"), "Tehran");
    await userEvent.type(screen.getByLabelText(/^Area/), "240");
    await userEvent.type(screen.getByLabelText("Title reference"), "TR-1");
    await userEvent.click(screen.getByRole("button", { name: /record property/i }));

    await waitFor(() => {
      expect(recordRealEstateProfile).toHaveBeenCalledWith(
        "tok",
        "asset-1",
        expect.objectContaining({ addressLine: "Plot 14", city: "Tehran", titleReference: "TR-1" }),
      );
    });
  });

  it("lists what the token conveys, with the wording it was granted in", async () => {
    renderPage(apiWith(withProfile()));

    expect(await screen.findByText(/Net rental income, quarterly, clause 7.2/)).toBeTruthy();
  });

  it("distinguishes rights not yet established from a token that conveys nothing", async () => {
    // The whole point of the empty state: silence is not a grant, and it is
    // also not a refusal.
    renderPage(apiWith(structuring));

    expect(await screen.findByText(/not been established/i)).toBeTruthy();
  });

  it("conveys a right with its wording", async () => {
    const conveyRight = vi.fn().mockResolvedValue(undefined);
    renderPage(apiWith(structuring, { conveyRight }));

    await userEvent.type(await screen.findByLabelText(/wording/i), "clause 7.2");
    await userEvent.click(screen.getByRole("button", { name: /convey right/i }));

    await waitFor(() => {
      expect(conveyRight).toHaveBeenCalledWith("tok", "asset-1", "income", "clause 7.2");
    });
  });

  it("withdraws a conveyed right", async () => {
    const withdrawRight = vi.fn().mockResolvedValue(undefined);
    renderPage(apiWith(withProfile(), { withdrawRight }));

    await userEvent.click(await screen.findByRole("button", { name: /withdraw/i }));

    await waitFor(() => {
      expect(withdrawRight).toHaveBeenCalledWith("tok", "asset-1", "income");
    });
  });

  it("offers no controls once the asset is approved", async () => {
    // The API refuses after approval, so a button here would be a lie.
    renderPage(apiWith({ ...withProfile(), state: "tokenized" }));

    expect(await screen.findByText("Plot 14, Vanak Street")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /record property/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /convey right/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /withdraw/i })).toBeNull();
  });
});

// The gap this closes: both forms were only ever exercised on the happy path,
// so nothing proved a server refusal reaches the officer rather than vanishing.
describe("AssetDetailPage property and rights refusals", () => {
  it("surfaces a refused property instead of appearing to succeed", async () => {
    renderPage(
      apiWith(structuring, {
        recordRealEstateProfile: vi
          .fn()
          .mockRejectedValue(
            new ApiError(400, "area must be a positive whole number of square metres"),
          ),
      }),
    );

    await userEvent.type(await screen.findByLabelText("Address"), "Plot 14");
    await userEvent.click(screen.getByRole("button", { name: /record property/i }));

    expect((await screen.findByRole("alert")).textContent).toContain("positive whole number");
  });

  it("surfaces a refused right, with the server's wording", async () => {
    renderPage(
      apiWith(structuring, {
        conveyRight: vi
          .fn()
          .mockRejectedValue(
            new ApiError(400, "a conveyed right needs the wording it was granted in"),
          ),
      }),
    );

    await userEvent.click(await screen.findByRole("button", { name: /convey right/i }));

    expect((await screen.findByRole("alert")).textContent).toContain("wording it was granted in");
  });

  it("surfaces a refused withdrawal rather than dropping the right from view", async () => {
    renderPage(
      apiWith(
        {
          ...structuring,
          rights: [{ kind: "income", note: "clause 7.2" }],
        },
        {
          withdrawRight: vi.fn().mockRejectedValue(new ApiError(409, "the dossier is frozen")),
        },
      ),
    );

    await userEvent.click(await screen.findByRole("button", { name: /withdraw/i }));

    expect((await screen.findByRole("alert")).textContent).toContain("frozen");
    // The right is still listed: a failed withdrawal must not look like a
    // successful one.
    expect(screen.getByTestId("right-income")).toBeTruthy();
  });

  // 3.3: who brought this asset. An officer reading the file needs the issuer's
  // legal name, and absent means the platform onboarded it itself.
  it("names the issuer that brought the asset", async () => {
    const brought: AssetViewDto = {
      ...structuring,
      organisationId: "org-1",
      organisationName: "Vanak Property Holdings PJSC",
    };
    renderPage(apiWith(brought));

    expect(await screen.findByText(/Vanak Property Holdings PJSC/)).toBeInTheDocument();
  });

  it("says nothing about an issuer for a platform-onboarded asset", async () => {
    // Absent is a real answer: the platform onboarded it. No empty row.
    renderPage(apiWith(structuring));

    await screen.findByRole("heading", { name: "Vanak Tower SPV" });
    expect(screen.queryByText(/brought by/i)).toBeNull();
  });
});
