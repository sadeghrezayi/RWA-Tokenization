import { describe, expect, it } from "vitest";
import {
  Attestation,
  canonicalAttestationPayload,
} from "../../../src/domain/attestations/attestation.js";
import { InvalidAttestationError } from "../../../src/domain/attestations/errors.js";

const ISSUED = new Date("2026-07-01T00:00:00Z");
const VALID_UNTIL = new Date("2026-10-01T00:00:00Z");

const fields = (overrides: Partial<Parameters<typeof Attestation.issue>[0]> = {}) => ({
  id: "att-1",
  assetId: "asset-1",
  kind: "valuation" as const,
  valueRial: 5_000_000_000n,
  attestorId: "attestor-1",
  issuedAt: ISSUED,
  validUntil: VALID_UNTIL,
  payloadHash: "a".repeat(64),
  signature: "0xsig",
  ...overrides,
});

describe("Attestation (FR-OR-1/2)", () => {
  it("issues_with_all_signed_metadata", () => {
    const att = Attestation.issue(fields());
    expect(att.id).toBe("att-1");
    expect(att.assetId).toBe("asset-1");
    expect(att.kind).toBe("valuation");
    expect(att.valueRial).toBe(5_000_000_000n);
    expect(att.attestorId).toBe("attestor-1");
    expect(att.payloadHash).toBe("a".repeat(64));
    expect(att.signature).toBe("0xsig");
    expect(att.documentCid).toBeUndefined();
  });

  it("carries_an_optional_reference_document", () => {
    const att = Attestation.issue(fields({ documentCid: "bafyDoc" }));
    expect(att.documentCid).toBe("bafyDoc");
  });

  it.each(["valuation", "nav", "rent", "reserve"] as const)("accepts_the_%s_kind", (kind) => {
    expect(Attestation.issue(fields({ kind })).kind).toBe(kind);
  });

  it.each([0n, -1n])("rejects_a_non_positive_value_%s", (valueRial) => {
    expect(() => Attestation.issue(fields({ valueRial }))).toThrow(InvalidAttestationError);
  });

  it("rejects_a_validity_window_that_does_not_move_forward", () => {
    expect(() => Attestation.issue(fields({ validUntil: ISSUED }))).toThrow(
      InvalidAttestationError,
    );
    expect(() =>
      Attestation.issue(fields({ validUntil: new Date("2026-06-30T00:00:00Z") })),
    ).toThrow(InvalidAttestationError);
  });

  it.each([
    ["payloadHash", { payloadHash: "" }],
    ["signature", { signature: "  " }],
    ["attestorId", { attestorId: "" }],
  ])("rejects_a_blank_%s", (_name, override) => {
    expect(() => Attestation.issue(fields(override))).toThrow(InvalidAttestationError);
  });
});

describe("Attestation freshness (FR-OR-3)", () => {
  it("is_fresh_up_to_and_including_the_validity_boundary", () => {
    const att = Attestation.issue(fields());
    expect(att.isFresh(ISSUED)).toBe(true);
    expect(att.isFresh(new Date("2026-09-30T23:59:59Z"))).toBe(true);
    expect(att.isFresh(VALID_UNTIL)).toBe(true);
  });

  it("is_stale_after_the_validity_window", () => {
    const att = Attestation.issue(fields());
    const after = new Date("2026-10-01T00:00:01Z");
    expect(att.isFresh(after)).toBe(false);
    expect(att.isExpired(after)).toBe(true);
  });
});

describe("canonicalAttestationPayload", () => {
  it("is_deterministic_and_covers_every_signed_field", () => {
    const payload = canonicalAttestationPayload({
      assetId: "asset-1",
      kind: "valuation",
      valueRial: 5_000_000_000n,
      attestorId: "attestor-1",
      issuedAt: ISSUED,
      validUntil: VALID_UNTIL,
    });
    // Same inputs → identical payload (a signer hashes this).
    expect(payload).toBe(
      canonicalAttestationPayload({
        assetId: "asset-1",
        kind: "valuation",
        valueRial: 5_000_000_000n,
        attestorId: "attestor-1",
        issuedAt: ISSUED,
        validUntil: VALID_UNTIL,
      }),
    );
    expect(payload).toContain("asset-1");
    expect(payload).toContain("valuation");
    expect(payload).toContain("5000000000");
  });

  it("changes_when_any_signed_field_changes", () => {
    const base = {
      assetId: "asset-1",
      kind: "valuation" as const,
      valueRial: 5_000_000_000n,
      attestorId: "attestor-1",
      issuedAt: ISSUED,
      validUntil: VALID_UNTIL,
    };
    expect(canonicalAttestationPayload(base)).not.toBe(
      canonicalAttestationPayload({ ...base, valueRial: 5_000_000_001n }),
    );
  });
});
