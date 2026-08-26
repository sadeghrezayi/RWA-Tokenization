import { beforeEach, describe, expect, it } from "vitest";
import {
  GetIssuerAssetHolders,
  holderReferenceFor,
} from "../../../src/application/issuers/issuer-asset-holders.js";
import { NotIssuerTeamMemberError } from "../../../src/application/issuers/errors.js";
import type { RegistryHolderView } from "../../../src/application/registry/get-holder-registry.js";

const ASSET = "asset-1";
const ORG = "org-1";
const MEMBER = "user-1";

// The admin/auditor registry row, PII included — this is deliberately the rich
// shape, because the whole point is what the issuer projection refuses to carry
// out of it.
const holder = (overrides: Partial<RegistryHolderView> = {}): RegistryHolderView => ({
  wallet: "0xAbCdEf0000000000000000000000000000000001",
  tokens: "60",
  since: "2026-08-20T09:00:00.000Z",
  shareBps: 6_000,
  investorId: "inv-1",
  email: "alice@example.com",
  ...overrides,
});

const registry = (holders: RegistryHolderView[]) => ({
  execute: () =>
    Promise.resolve({
      assetId: ASSET,
      assetName: "Vanak Tower",
      tokenAddress: "0xToken",
      holders,
      registryTotal: "100",
      onChainSupply: "100",
      matchesChain: true,
      history: [],
    }),
});

const allocations = (
  rows: { investorId: string; allocated: bigint; costRial: bigint; refundRial: bigint; at: Date }[],
) => ({ forAsset: () => Promise.resolve(rows) });

const assets = (organisationId: string | undefined) => ({
  organisationOf: () => Promise.resolve(organisationId),
});

const access = (allowed: boolean) => ({
  assertMember: () =>
    allowed ? Promise.resolve() : Promise.reject(new NotIssuerTeamMemberError()),
});

// P1-2 (FR-PT-2, a MUST): the holder registry an issuer sees for their OWN
// asset. The field list is the one proposed in
// docs/proposals/issuer-investor-visibility.md.
//
// The acceptance criterion this suite exists to satisfy, in the backlog's own
// words: a test that asserts the EXCLUDED fields are absent. Asserting the
// included ones is the easy half; a leak is always a field nobody asserted
// about.
describe("GetIssuerAssetHolders", () => {
  let subject: GetIssuerAssetHolders;

  const build = (
    holders: RegistryHolderView[],
    rows: Parameters<typeof allocations>[0] = [],
    org: string | undefined = ORG,
    allowed = true,
  ) =>
    new GetIssuerAssetHolders(registry(holders), allocations(rows), assets(org), access(allowed));

  beforeEach(() => {
    subject = build(
      [holder()],
      [
        {
          investorId: "inv-1",
          allocated: 60n,
          costRial: 60_000n,
          refundRial: 5_000n,
          at: new Date("2026-08-20T09:00:00.000Z"),
        },
      ],
    );
  });

  it("shows the cap table the issuer is owed", async () => {
    const view = await subject.execute({ assetId: ASSET, userId: MEMBER });

    expect(view.assetName).toBe("Vanak Tower");
    expect(view.holders).toEqual([
      {
        holderReference: holderReferenceFor(ASSET, "inv-1"),
        tokens: "60",
        shareBps: 6_000,
        holderSince: "2026-08-20T09:00:00.000Z",
        tokensAllocated: "60",
        amountInvestedRial: "60000",
        amountRefundedRial: "5000",
        allocationDate: "2026-08-20T09:00:00.000Z",
      },
    ]);
  });

  it("carries NO email, wallet or investor id — the excluded list, asserted", async () => {
    // The whole serialized response, not a field-by-field check: a leak that
    // arrives through a nested object or a future field would pass the latter.
    const view = await subject.execute({ assetId: ASSET, userId: MEMBER });
    const serialized = JSON.stringify(view);

    expect(serialized).not.toContain("alice@example.com");
    expect(serialized).not.toContain("alice");
    expect(serialized.toLowerCase()).not.toContain("0xabcdef");
    expect(serialized).not.toContain("inv-1");
    expect(serialized).not.toContain("email");
    expect(serialized).not.toContain("wallet");
    expect(serialized).not.toContain("investorId");
  });

  it("gives the same holder the same reference every time, and different holders different ones", () => {
    // An issuer must be able to follow one holder across reads without ever
    // being handed a platform-wide identifier.
    const a = holderReferenceFor(ASSET, "inv-1");
    expect(holderReferenceFor(ASSET, "inv-1")).toBe(a);
    expect(holderReferenceFor(ASSET, "inv-2")).not.toBe(a);
  });

  it("gives the SAME investor different references under different assets", () => {
    // The cross-asset linkability the proposal is built to avoid: two issuers
    // comparing notes must not be able to tell they share a holder.
    expect(holderReferenceFor("asset-2", "inv-1")).not.toBe(holderReferenceFor(ASSET, "inv-1"));
  });

  it("still lists a holder the platform cannot name, rather than dropping them", async () => {
    // The registry's own rule: an unknown wallet stays visible. A cap table
    // that silently omits a holder is worse than one naming them opaquely.
    // Built by omission, not by passing `undefined`: exactOptionalPropertyTypes
    // forbids assigning undefined to an optional property, and an unknown
    // wallet is genuinely a row with those keys ABSENT.
    const unnamed: RegistryHolderView = {
      wallet: "0xAbCdEf0000000000000000000000000000000009",
      tokens: "40",
      since: "2026-08-21T09:00:00.000Z",
      shareBps: 4_000,
    };

    const view = await build([unnamed]).execute({ assetId: ASSET, userId: MEMBER });

    expect(view.holders).toHaveLength(1);
    expect(view.holders[0]?.holderReference).toBeTruthy();
    // No allocation is known for them, so the money fields are absent rather
    // than zero — zero would read as "invested nothing".
    expect(view.holders[0]).not.toHaveProperty("amountInvestedRial");
  });

  it("sums an investor's allocations across the asset's offerings", async () => {
    // One asset can raise more than once. "Amount invested" is what they put
    // into THIS asset, not into whichever offering happened to be read first.
    const view = await build(
      [holder()],
      [
        {
          investorId: "inv-1",
          allocated: 40n,
          costRial: 40_000n,
          refundRial: 1_000n,
          at: new Date("2026-08-20T09:00:00.000Z"),
        },
        {
          investorId: "inv-1",
          allocated: 20n,
          costRial: 20_000n,
          refundRial: 500n,
          at: new Date("2026-06-01T09:00:00.000Z"),
        },
      ],
    ).execute({ assetId: ASSET, userId: MEMBER });

    expect(view.holders[0]?.tokensAllocated).toBe("60");
    expect(view.holders[0]?.amountInvestedRial).toBe("60000");
    expect(view.holders[0]?.amountRefundedRial).toBe("1500");
    // The EARLIEST: when this holder first backed the asset.
    expect(view.holders[0]?.allocationDate).toBe("2026-06-01T09:00:00.000Z");
  });

  it("refuses someone who is not on the issuer's team", async () => {
    await expect(
      build([holder()], [], ORG, false).execute({ assetId: ASSET, userId: "stranger" }),
    ).rejects.toThrow(NotIssuerTeamMemberError);
  });

  it("refuses an asset that belongs to no issuer at all", async () => {
    // A NULL organisation means the platform onboarded it, not "open to
    // anyone" — the most dangerous way to read a nullable owner.
    // Constructed inline rather than through `build`: passing `undefined` for a
    // parameter that HAS a default applies the default, so the "ownerless"
    // case silently became "owned by ORG" and the test passed against code
    // that had not been written yet.
    const ownerless = new GetIssuerAssetHolders(
      registry([holder()]),
      allocations([]),
      { organisationOf: () => Promise.resolve(undefined) },
      access(true),
    );

    await expect(ownerless.execute({ assetId: ASSET, userId: MEMBER })).rejects.toThrow(
      NotIssuerTeamMemberError,
    );
  });
});
