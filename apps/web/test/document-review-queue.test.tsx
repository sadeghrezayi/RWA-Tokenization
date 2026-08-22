import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DocumentReviewQueue } from "../components/admin/document-review-queue";
import type { ApiClient, DocumentAwaitingReviewDto } from "../lib/api";
import { stubApi } from "./auth-panel.test";

const pending: DocumentAwaitingReviewDto = {
  assetId: "asset-1",
  assetName: "Vanak Tower",
  kind: "ownership_evidence",
  title: "Title deed",
  cid: "bafy-1",
  sha256: "a".repeat(64),
  state: "pending",
};

const rejected: DocumentAwaitingReviewDto = {
  ...pending,
  assetId: "asset-2",
  assetName: "Elahieh Plaza",
  kind: "counsel_signoff",
  title: "Counsel opinion",
  state: "rejected",
  reason: "the opinion is unsigned",
};

const renderQueue = (rows: DocumentAwaitingReviewDto[], overrides: Partial<ApiClient> = {}) =>
  render(
    <DocumentReviewQueue
      locale="en"
      token="tok"
      api={stubApi({
        documentsAwaitingReview: vi.fn().mockResolvedValue(rows),
        ...overrides,
      })}
    />,
  );

// 4.3. This screen is the only place a person decides whether the evidence
// behind a token is sound. It must never imply a decision nobody made.
describe("DocumentReviewQueue", () => {
  it("names the asset a document belongs to, not just the document", async () => {
    renderQueue([pending]);

    const row = await screen.findByTestId("doc-review-0");
    expect(row.textContent).toMatch(/Vanak Tower/);
    expect(row.textContent).toMatch(/Title deed/);
  });

  it("shows a previously rejected document WITH the reason it was rejected for", async () => {
    // Without the reason the next reviewer starts from nothing, and the issuer
    // was told something this screen cannot repeat.
    renderQueue([rejected]);

    const row = await screen.findByTestId("doc-review-0");
    expect(row.textContent).toMatch(/unsigned/);
  });

  it("accepts a document and takes it off the queue", async () => {
    const acceptDocument = vi.fn().mockResolvedValue(undefined);
    const documentsAwaitingReview = vi.fn().mockResolvedValueOnce([pending]).mockResolvedValue([]);
    renderQueue([], { acceptDocument, documentsAwaitingReview });

    fireEvent.click(await screen.findByTestId("doc-accept-0"));

    await waitFor(() => {
      expect(acceptDocument).toHaveBeenCalledWith("tok", "asset-1", "ownership_evidence");
    });
    expect(await screen.findByTestId("no-documents-awaiting")).toBeTruthy();
  });

  it("REFUSES to send a rejection with no reason, without calling the server", async () => {
    // The server refuses it too, but an officer should not have to discover
    // that from a 400 — and a rejection nobody can act on is a wall.
    const rejectDocument = vi.fn();
    renderQueue([pending], { rejectDocument });

    fireEvent.click(await screen.findByTestId("doc-reject-0"));

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(rejectDocument).not.toHaveBeenCalled();
  });

  it("sends a rejection with its reason", async () => {
    const rejectDocument = vi.fn().mockResolvedValue(undefined);
    renderQueue([pending], { rejectDocument });

    fireEvent.change(await screen.findByTestId("doc-reason-0"), {
      target: { value: "the deed names a different parcel" },
    });
    fireEvent.click(screen.getByTestId("doc-reject-0"));

    await waitFor(() => {
      expect(rejectDocument).toHaveBeenCalledWith(
        "tok",
        "asset-1",
        "ownership_evidence",
        "the deed names a different parcel",
      );
    });
  });

  it("says the queue is empty, rather than showing nothing at all", async () => {
    renderQueue([]);

    expect(await screen.findByTestId("no-documents-awaiting")).toBeTruthy();
  });

  it("distinguishes a failed load from an empty queue", async () => {
    renderQueue([], {
      documentsAwaitingReview: vi.fn().mockRejectedValue(new Error("upstream is down")),
    });

    expect((await screen.findByRole("alert")).textContent).toMatch(/upstream is down/);
    expect(screen.queryByTestId("no-documents-awaiting")).toBeNull();
  });
});
