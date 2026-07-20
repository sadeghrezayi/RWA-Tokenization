import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RegistryPanel } from "../components/registry-panel";
import type { ApiClient, AssetViewDto, HolderRegistryDto } from "../lib/api";

const asset = (id: string, name: string, tokenized = true): AssetViewDto => ({
  id,
  name,
  type: "asset_backed",
  state: tokenized ? "tokenized" : "approved",
  ...(tokenized ? { tokenAddress: `0xTok${id}` } : {}),
  custody: { custodianName: "Bank", location: "Tehran" },
  checklist: { confirmed: [], unconfirmed: [] },
  dossier: { complete: true, missingKinds: [], documents: [] },
});

const registry: HolderRegistryDto = {
  assetId: "asset-1",
  assetName: "Vanak Tower SPV",
  tokenAddress: "0xTokasset-1",
  holders: [
    {
      wallet: "0xbbb2",
      tokens: "55",
      since: "2026-07-01T00:00:00.000Z",
      shareBps: 6111,
      investorId: "bob",
      email: "bob@demo.com",
    },
    {
      wallet: "0xaaa1",
      tokens: "35",
      since: "2026-07-01T00:00:00.000Z",
      shareBps: 3888,
      investorId: "sara",
      email: "sara@demo.com",
    },
  ],
  registryTotal: "90",
  onChainSupply: "90",
  matchesChain: true,
  history: [
    {
      kind: "transfer",
      from: "sara@demo.com",
      to: "bob@demo.com",
      tokens: "15",
      at: "2026-07-02T00:00:00.000Z",
      ref: "0xt1feedbeef",
    },
  ],
};

const apiWith = (overrides: Partial<ApiClient>): ApiClient =>
  ({
    listAssets: vi
      .fn()
      .mockResolvedValue([
        asset("asset-1", "Vanak Tower SPV"),
        asset("asset-2", "Gold Vault SPV"),
        asset("asset-3", "Paper SPV", false),
      ]),
    holderRegistry: vi.fn().mockResolvedValue(registry),
    registryCsv: vi.fn().mockResolvedValue({ filename: "r.csv", csv: "email\n" }),
    transfersCsv: vi.fn().mockResolvedValue({ filename: "t.csv", csv: "at\n" }),
    ...overrides,
  }) as ApiClient;

describe("RegistryPanel", () => {
  it("loads_the_first_tokenized_asset_and_renders_holders_with_reconciliation", async () => {
    const holderRegistry = vi.fn().mockResolvedValue(registry);
    render(<RegistryPanel locale="en" api={apiWith({ holderRegistry })} token="tok" />);

    expect(await screen.findByText("bob@demo.com")).toBeInTheDocument();
    expect(holderRegistry).toHaveBeenCalledWith("tok", "asset-1");
    expect(screen.getByText("55")).toBeInTheDocument();
    expect(screen.getByText("61.11%")).toBeInTheDocument();
    expect(screen.getByText("Matches chain")).toBeInTheDocument();
  });

  it("reloads_when_another_asset_is_selected", async () => {
    const holderRegistry = vi.fn().mockResolvedValue(registry);
    render(<RegistryPanel locale="en" api={apiWith({ holderRegistry })} token="tok" />);
    await screen.findByText("bob@demo.com");

    await userEvent.selectOptions(screen.getByLabelText("Asset"), "asset-2");

    await waitFor(() => {
      expect(holderRegistry).toHaveBeenCalledWith("tok", "asset-2");
    });
  });

  it("shows_a_supply_mismatch_prominently", async () => {
    const holderRegistry = vi.fn().mockResolvedValue({
      ...registry,
      matchesChain: false,
      onChainSupply: "85",
    });
    render(<RegistryPanel locale="en" api={apiWith({ holderRegistry })} token="tok" />);

    expect(await screen.findByText("MISMATCH vs chain")).toBeInTheDocument();
    expect(screen.getByText(/90/)).toBeInTheDocument();
    expect(screen.getByText(/85/)).toBeInTheDocument();
  });

  it("names_unknown_wallets_honestly", async () => {
    const holderRegistry = vi.fn().mockResolvedValue({
      ...registry,
      holders: [
        {
          wallet: "0xdeadbeefdeadbeefdead",
          tokens: "10",
          since: "2026-07-01T00:00:00.000Z",
          shareBps: 10000,
        },
      ],
    });
    render(<RegistryPanel locale="en" api={apiWith({ holderRegistry })} token="tok" />);

    expect(await screen.findByText("Unknown wallet")).toBeInTheDocument();
    expect(screen.getByText("0xdead…dead")).toBeInTheDocument();
  });

  it("downloads_the_registry_csv_for_the_selected_asset", async () => {
    URL.createObjectURL = vi.fn(() => "blob:fake");
    URL.revokeObjectURL = vi.fn();
    const registryCsv = vi.fn().mockResolvedValue({ filename: "r.csv", csv: "email\n" });
    render(<RegistryPanel locale="en" api={apiWith({ registryCsv })} token="tok" />);
    await screen.findByText("bob@demo.com");

    await userEvent.click(screen.getByRole("button", { name: "Download registry CSV" }));

    await waitFor(() => {
      expect(registryCsv).toHaveBeenCalledWith("tok", "asset-1");
    });
  });

  it("renders_the_transfer_history_with_chain_refs", async () => {
    render(<RegistryPanel locale="en" api={apiWith({})} token="tok" />);

    expect(await screen.findByText(/sara@demo.com → bob@demo.com/)).toBeInTheDocument();
    expect(screen.getByText("transfer")).toBeInTheDocument();
  });

  it("shows_the_empty_state_without_tokenized_assets", async () => {
    render(
      <RegistryPanel
        locale="en"
        api={apiWith({
          listAssets: vi.fn().mockResolvedValue([asset("asset-3", "Paper SPV", false)]),
        })}
        token="tok"
      />,
    );

    expect(
      await screen.findByText("No tokenized assets yet — tokenize an asset first."),
    ).toBeInTheDocument();
  });
});
