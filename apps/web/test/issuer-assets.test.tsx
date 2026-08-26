import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { IssuerAssets } from "../components/issuer/issuer-assets";
import type { ApiClient, AssetViewDto } from "../lib/api";
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

const renderAssets = (rows: AssetViewDto[] | Error, overrides: Partial<ApiClient> = {}) =>
  render(
    <IssuerAssets
      locale="en"
      organisationId="org-1"
      csrf="csrf-token"
      api={stubApi({
        issuerAssets:
          rows instanceof Error ? vi.fn().mockRejectedValue(rows) : vi.fn().mockResolvedValue(rows),
        ...overrides,
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

// 3.3h: the issuer brings its own asset. A portal that can only watch is a
// report, not a portal.
describe("IssuerAssets — bringing one", () => {
  it("brings an asset in the organisation's name, then shows it without a reload", async () => {
    const bringIssuerAsset = vi.fn().mockResolvedValue({ assetId: "asset-9" });
    const issuerAssets = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([asset({ id: "asset-9", name: "Elahiyeh Block C" })]);

    render(
      <IssuerAssets
        locale="en"
        organisationId="org-1"
        csrf="csrf-token"
        api={stubApi({ issuerAssets, bringIssuerAsset })}
      />,
    );

    await screen.findByTestId("no-issuer-assets");
    fireEvent.change(screen.getByLabelText(/asset name/i), {
      target: { value: "Elahiyeh Block C" },
    });
    fireEvent.click(screen.getByRole("button", { name: /bring/i }));

    await waitFor(() => {
      expect(bringIssuerAsset).toHaveBeenCalledWith("csrf-token", "org-1", "Elahiyeh Block C");
    });
    expect(await screen.findByTestId("issuer-asset-asset-9")).toBeTruthy();
  });

  it("shows a refusal from the platform instead of pretending it worked", async () => {
    renderAssets([], {
      bringIssuerAsset: vi
        .fn()
        .mockRejectedValue(new Error("this organisation cannot submit assets yet")),
    });

    await screen.findByTestId("no-issuer-assets");
    fireEvent.change(screen.getByLabelText(/asset name/i), { target: { value: "Too Early" } });
    fireEvent.click(screen.getByRole("button", { name: /bring/i }));

    expect((await screen.findByRole("alert")).textContent).toContain("cannot submit assets yet");
  });

  it("does not send an empty name", async () => {
    const bringIssuerAsset = vi.fn();
    renderAssets([], { bringIssuerAsset });

    await screen.findByTestId("no-issuer-assets");
    fireEvent.click(screen.getByRole("button", { name: /bring/i }));

    expect(bringIssuerAsset).not.toHaveBeenCalled();
  });
});

// 3.3i: the issuer supplies the dossier for its own asset. Until now the
// portal showed "Missing: 6" and offered nothing to do about it.
describe("IssuerAssets — filing the dossier", () => {
  const withMissing = (over: Partial<AssetViewDto> = {}) =>
    asset({
      id: "asset-1",
      name: "Vanak Tower Floor 7",
      dossier: {
        complete: false,
        missingKinds: ["ownership_evidence", "valuation_report"],
        documents: [],
      },
      ...over,
    });

  it("files the chosen file's bytes, not a name typed into a box", async () => {
    const attachIssuerAssetDocument = vi.fn().mockResolvedValue({ cid: "c", sha256: "s" });
    renderAssets([withMissing()], { attachIssuerAssetDocument });

    fireEvent.click(await screen.findByRole("button", { name: /vanak tower floor 7/i }));
    const deed = new File(["the actual deed bytes"], "deed.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByLabelText(/document title/i), { target: { value: "Title deed" } });
    fireEvent.change(screen.getByLabelText(/^file$/i), { target: { files: [deed] } });
    fireEvent.click(screen.getByRole("button", { name: /attach/i }));

    await waitFor(() => {
      expect(attachIssuerAssetDocument).toHaveBeenCalledWith("csrf-token", "org-1", "asset-1", {
        kind: "ownership_evidence",
        title: "Title deed",
        contentBase64: btoa("the actual deed bytes"),
      });
    });
  });

  it("will not file a document with no file behind it", async () => {
    const attachIssuerAssetDocument = vi.fn();
    renderAssets([withMissing()], { attachIssuerAssetDocument });

    fireEvent.click(await screen.findByRole("button", { name: /vanak tower floor 7/i }));
    fireEvent.change(screen.getByLabelText(/document title/i), { target: { value: "Nothing" } });
    fireEvent.click(screen.getByRole("button", { name: /attach/i }));

    expect(attachIssuerAssetDocument).not.toHaveBeenCalled();
    // And it must REFUSE, not fall over: without the guard the reader throws on
    // a missing file, which ALSO results in no call — so "not called" alone
    // passes whether the rule exists or not. The absence of an error is what
    // tells a clean refusal from a crash.
    // The wait has to come BEFORE the assertion, not inside a waitFor: an
    // assertion that something is ABSENT succeeds on the first tick, before any
    // rejection has landed, so waitFor(() => expect(...).toBeNull()) passes
    // instantly either way. It did, and it hid the missing guard through two
    // rounds of mutation-checking.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows the platform's refusal instead of pretending it filed", async () => {
    renderAssets([withMissing()], {
      attachIssuerAssetDocument: vi
        .fn()
        .mockRejectedValue(new Error("a dossier document may be at most 10 MB")),
    });

    fireEvent.click(await screen.findByRole("button", { name: /vanak tower floor 7/i }));
    const big = new File(["x"], "big.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByLabelText(/document title/i), { target: { value: "Too big" } });
    fireEvent.change(screen.getByLabelText(/^file$/i), { target: { files: [big] } });
    fireEvent.click(screen.getByRole("button", { name: /attach/i }));

    expect((await screen.findByRole("alert")).textContent).toContain("at most 10 MB");
  });

  it("offers nothing to file for an asset whose dossier is complete", async () => {
    renderAssets(
      [withMissing({ dossier: { complete: true, missingKinds: [], documents: [] } })],
      {},
    );

    fireEvent.click(await screen.findByRole("button", { name: /vanak tower floor 7/i }));

    expect(screen.queryByLabelText(/document title/i)).toBeNull();
  });

  it("links each asset to its own holder registry (P1-2)", async () => {
    // The endpoint exists and the screen exists; without this link the issuer
    // has no way to reach it, which is the difference between a delivered
    // capability and one that is merely implemented.
    renderAssets([asset()]);

    const link = await screen.findByTestId("issuer-asset-holders-link-asset-1");
    expect(link.getAttribute("href")).toBe("/en/issuer/org-1/assets/asset-1/holders");
  });
});
