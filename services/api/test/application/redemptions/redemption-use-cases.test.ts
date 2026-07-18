import { describe, expect, it } from "vitest";
import { RequestRedemption } from "../../../src/application/redemptions/request-redemption.js";
import { FulfillRedemption } from "../../../src/application/redemptions/fulfill-redemption.js";
import { RejectRedemption } from "../../../src/application/redemptions/reject-redemption.js";
import { ListRedemptions } from "../../../src/application/redemptions/get-redemptions.js";
import {
  NoFreshValuationError,
  RedemptionNotFoundError,
} from "../../../src/application/redemptions/errors.js";
import {
  InsufficientTokenBalanceError,
  TransferNotAllowedError,
} from "../../../src/application/transfers/errors.js";
import { Attestation } from "../../../src/domain/attestations/attestation.js";
import { Asset } from "../../../src/domain/assets/asset.js";
import { LegalDossier } from "../../../src/domain/assets/legal-dossier.js";
import { OnboardingChecklist } from "../../../src/domain/assets/onboarding-checklist.js";
import { EmailAddress } from "../../../src/domain/identity/email-address.js";
import { Investor } from "../../../src/domain/identity/investor.js";
import { KycStatus } from "../../../src/domain/identity/kyc-status.js";
import { PasswordHash } from "../../../src/domain/identity/password-hash.js";
import type { KycState } from "../../../src/domain/identity/kyc-status.js";
import type { HolderShare } from "../../../src/domain/distributions/distribution.js";
import type { HolderSnapshotProvider } from "../../../src/application/distributions/ports.js";
import { InMemoryAssetRepository, RecordingAssetEventLog } from "../../fakes/asset-fakes.js";
import { InMemoryInvestorRepository, SequentialIdGenerator } from "../../fakes/identity-fakes.js";
import { FixedClock } from "../../fakes/offering-fakes.js";
import { InMemoryAttestationRepository } from "../../fakes/attestation-fakes.js";
import { FakeAssetTokenTransferrer } from "../../fakes/transfer-fakes.js";
import {
  InMemoryRedemptionRepository,
  RecordingAssetTokenBurner,
  RecordingRedemptionLedger,
} from "../../fakes/redemption-fakes.js";

const NOW = new Date("2026-07-14T00:00:00Z");
const VALID_UNTIL = new Date("2026-10-01T00:00:00Z");

class StubSnapshot implements HolderSnapshotProvider {
  constructor(private readonly holders: HolderShare[]) {}
  snapshot(): Promise<HolderShare[]> {
    return Promise.resolve([...this.holders]);
  }
}

const tokenizedAsset = () =>
  Asset.restore({
    id: "asset-1",
    name: "Vanak Tower SPV",
    type: "asset_backed",
    state: "tokenized",
    dossier: LegalDossier.empty(),
    checklist: OnboardingChecklist.empty(),
    custody: undefined,
    tokenAddress: "0xTok1",
  });

const investorIn = (id: string, state: KycState) =>
  Investor.restore(
    id,
    EmailAddress.of(`${id}@example.com`),
    PasswordHash.of("hashed:pw"),
    KycStatus.restore(state),
  );

const valuation = (validUntil = VALID_UNTIL) =>
  Attestation.issue({
    id: "att-1",
    assetId: "asset-1",
    kind: "valuation",
    valueRial: 12_500_000_000n,
    attestorId: "attestor-1",
    issuedAt: new Date("2026-07-01T00:00:00Z"),
    validUntil,
    payloadHash: "0xhash",
    signature: "0xsig",
  });

const setup = async () => {
  const redemptions = new InMemoryRedemptionRepository();
  const assets = new InMemoryAssetRepository();
  const investors = new InMemoryInvestorRepository();
  const attestations = new InMemoryAttestationRepository();
  const transferrer = new FakeAssetTokenTransferrer();
  const burner = new RecordingAssetTokenBurner();
  const ledger = new RecordingRedemptionLedger();
  const events = new RecordingAssetEventLog();
  const clock = new FixedClock(NOW);
  await assets.save(tokenizedAsset());
  await investors.save(investorIn("alice", "approved"));
  await investors.save(investorIn("carol", "draft"));
  transferrer.credit("alice", 100n);
  await attestations.save(valuation());
  const snapshots = new StubSnapshot([
    { investorId: "alice", tokens: 100n },
    { investorId: "bob", tokens: 900n },
  ]);
  return {
    redemptions,
    attestations,
    burner,
    ledger,
    events,
    clock,
    request: new RequestRedemption(
      redemptions,
      investors,
      assets,
      transferrer,
      new SequentialIdGenerator(),
      events,
      clock,
    ),
    fulfill: new FulfillRedemption(
      redemptions,
      attestations,
      snapshots,
      burner,
      ledger,
      events,
      clock,
    ),
    reject: new RejectRedemption(redemptions, events, clock),
    list: new ListRedemptions(redemptions),
  };
};

describe("RequestRedemption (FR-TR-2)", () => {
  it("records_a_requested_redemption_with_an_audit_event", async () => {
    const s = await setup();

    const { redemptionId } = await s.request.execute({
      assetId: "asset-1",
      investorId: "alice",
      tokens: 25n,
    });

    const stored = await s.redemptions.findById(redemptionId);
    expect(stored?.state).toBe("requested");
    expect(stored?.tokens).toBe(25n);
    expect(s.events.events.at(-1)).toMatchObject({
      assetId: "asset-1",
      event: "redemption_requested",
      actor: "alice",
    });
    // Nothing burns or pays at request time.
    expect(s.burner.burned).toEqual([]);
    expect(s.ledger.credited).toEqual([]);
  });

  it("rejects_an_ineligible_investor", async () => {
    const s = await setup();
    await expect(
      s.request.execute({ assetId: "asset-1", investorId: "carol", tokens: 5n }),
    ).rejects.toThrow(TransferNotAllowedError);
  });

  it("rejects_more_tokens_than_the_holder_owns", async () => {
    const s = await setup();
    await expect(
      s.request.execute({ assetId: "asset-1", investorId: "alice", tokens: 500n }),
    ).rejects.toThrow(InsufficientTokenBalanceError);
  });
});

describe("FulfillRedemption (burn + payout at attested value)", () => {
  const requested = async (s: Awaited<ReturnType<typeof setup>>) => {
    const { redemptionId } = await s.request.execute({
      assetId: "asset-1",
      investorId: "alice",
      tokens: 25n,
    });
    return redemptionId;
  };

  it("burns_then_credits_the_pro_rata_attested_value", async () => {
    const s = await setup();
    const id = await requested(s);

    const result = await s.fulfill.execute({ redemptionId: id, actor: "officer-1" });

    // valuation 12.5B / supply 1000 = 12.5M per token × 25 = 312.5M
    expect(result.payoutRial).toBe("312500000");
    expect(s.burner.burned).toEqual([{ tokenAddress: "0xTok1", investorId: "alice", tokens: 25n }]);
    expect(s.ledger.credited).toEqual([{ investorId: "alice", amountRial: 312_500_000n }]);
    expect((await s.redemptions.findById(id))?.state).toBe("fulfilled");
    expect(s.events.events.map((e) => e.event)).toContain("redemption_fulfilled");
  });

  it("refuses_without_a_fresh_valuation_and_burns_nothing", async () => {
    const s = await setup();
    const id = await requested(s);
    s.clock.current = new Date("2026-10-02T00:00:00Z"); // past validUntil

    await expect(s.fulfill.execute({ redemptionId: id, actor: "officer-1" })).rejects.toThrow(
      NoFreshValuationError,
    );
    expect(s.burner.burned).toEqual([]);
    expect((await s.redemptions.findById(id))?.state).toBe("requested");
  });

  it("refuses_when_no_valuation_exists", async () => {
    const s = await setup();
    const id = await requested(s);
    // wipe the only valuation
    const empty = new InMemoryAttestationRepository();
    const fulfill = new FulfillRedemption(
      s.redemptions,
      empty,
      new StubSnapshot([{ investorId: "alice", tokens: 100n }]),
      s.burner,
      s.ledger,
      s.events,
      s.clock,
    );
    await expect(fulfill.execute({ redemptionId: id, actor: "officer-1" })).rejects.toThrow(
      NoFreshValuationError,
    );
  });

  it("does_not_pay_or_mark_fulfilled_when_the_burn_fails", async () => {
    const s = await setup();
    const id = await requested(s);
    s.burner.failWith = new Error("devnet unreachable");

    await expect(s.fulfill.execute({ redemptionId: id, actor: "officer-1" })).rejects.toThrow(
      "devnet unreachable",
    );
    expect(s.ledger.credited).toEqual([]);
    expect((await s.redemptions.findById(id))?.state).toBe("requested");
  });

  it("throws_for_an_unknown_redemption", async () => {
    const s = await setup();
    await expect(
      s.fulfill.execute({ redemptionId: "missing", actor: "officer-1" }),
    ).rejects.toThrow(RedemptionNotFoundError);
  });
});

describe("RejectRedemption + ListRedemptions", () => {
  it("rejects_with_a_reason_and_lists_views", async () => {
    const s = await setup();
    const { redemptionId } = await s.request.execute({
      assetId: "asset-1",
      investorId: "alice",
      tokens: 10n,
    });

    await s.reject.execute({ redemptionId, reason: "stale valuation", actor: "officer-1" });

    const mine = await s.list.executeForInvestor({ investorId: "alice" });
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({
      state: "rejected",
      rejectionReason: "stale valuation",
      tokens: "10",
    });
    expect(s.events.events.map((e) => e.event)).toContain("redemption_rejected");
  });
});
