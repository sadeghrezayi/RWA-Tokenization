import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuditPanel } from "../components/audit-panel";
import type { ApiClient, AssetViewDto, AuditEventDto } from "../lib/api";

const assets: AssetViewDto[] = [
  {
    id: "asset-1",
    name: "Vanak Tower SPV",
    type: "asset_backed",
    state: "tokenized",
    tokenAddress: "0xTok1",
    checklist: { confirmed: [], unconfirmed: [] },
    dossier: { complete: true, missingKinds: [], documents: [] },
  },
];

const events: AuditEventDto[] = [
  {
    id: "2",
    assetId: "asset-1",
    assetName: "Vanak Tower SPV",
    event: "tokens_transferred",
    actor: "sara@demo.com",
    details: { to: "bob@demo.com", tokens: "15" },
    at: "2026-07-14T10:30:00.000Z",
  },
  {
    id: "1",
    assetId: "asset-1",
    assetName: "Vanak Tower SPV",
    event: "asset_proposed",
    actor: "officer@platform.local",
    details: {},
    at: "2026-07-01T09:00:00.000Z",
  },
];

const apiWith = (overrides: Partial<ApiClient>): ApiClient =>
  ({
    listAssets: vi.fn().mockResolvedValue(assets),
    auditTrail: vi.fn().mockResolvedValue(events),
    ...overrides,
  }) as ApiClient;

describe("AuditPanel", () => {
  it("lists_privileged_actions_with_actor_asset_and_time", async () => {
    const auditTrail = vi.fn().mockResolvedValue(events);
    render(<AuditPanel locale="en" api={apiWith({ auditTrail })} token="tok" />);

    expect(await screen.findByText("tokens_transferred")).toBeInTheDocument();
    expect(auditTrail).toHaveBeenCalledWith("tok", {});
    expect(screen.getByText("sara@demo.com")).toBeInTheDocument();
    expect(screen.getAllByText("Vanak Tower SPV").length).toBeGreaterThan(0);
    expect(screen.getByText("2026-07-14 10:30")).toBeInTheDocument();
    expect(screen.getByText(/to=bob@demo.com/)).toBeInTheDocument();
  });

  it("filters_the_trail_by_asset", async () => {
    const auditTrail = vi.fn().mockResolvedValue(events);
    render(<AuditPanel locale="en" api={apiWith({ auditTrail })} token="tok" />);
    await screen.findByText("tokens_transferred");

    await userEvent.selectOptions(screen.getByLabelText("Asset"), "asset-1");

    await waitFor(() => {
      expect(auditTrail).toHaveBeenCalledWith("tok", { assetId: "asset-1" });
    });
  });

  it("shows_the_empty_state_without_events", async () => {
    render(
      <AuditPanel
        locale="en"
        api={apiWith({ auditTrail: vi.fn().mockResolvedValue([]) })}
        token="tok"
      />,
    );

    expect(await screen.findByText("No audit events yet.")).toBeInTheDocument();
  });
});
