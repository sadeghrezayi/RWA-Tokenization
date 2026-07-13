import { describe, expect, it } from "vitest";
import { TransferTokens } from "../../../src/application/transfers/transfer-tokens.js";
import { ListTransfers } from "../../../src/application/transfers/get-transfers.js";
import {
  AssetNotTokenizedForTransferError,
  InsufficientTokenBalanceError,
  TransferNotAllowedError,
} from "../../../src/application/transfers/errors.js";
import { InvalidTransferError } from "../../../src/domain/transfers/errors.js";
import { InvestorNotFoundError } from "../../../src/application/identity/errors.js";
import { AssetNotFoundError } from "../../../src/application/assets/errors.js";
import { Asset } from "../../../src/domain/assets/asset.js";
import { LegalDossier } from "../../../src/domain/assets/legal-dossier.js";
import { OnboardingChecklist } from "../../../src/domain/assets/onboarding-checklist.js";
import { EmailAddress } from "../../../src/domain/identity/email-address.js";
import { Investor } from "../../../src/domain/identity/investor.js";
import { KycStatus } from "../../../src/domain/identity/kyc-status.js";
import { PasswordHash } from "../../../src/domain/identity/password-hash.js";
import type { KycState } from "../../../src/domain/identity/kyc-status.js";
import { InMemoryAssetRepository, RecordingAssetEventLog } from "../../fakes/asset-fakes.js";
import { InMemoryInvestorRepository, SequentialIdGenerator } from "../../fakes/identity-fakes.js";
import { FixedClock } from "../../fakes/offering-fakes.js";
import {
  FakeAssetTokenTransferrer,
  InMemoryTransferRepository,
} from "../../fakes/transfer-fakes.js";

const NOW = new Date("2026-07-13T00:00:00Z");

const tokenizedAsset = (id = "asset-1") =>
  Asset.restore({
    id,
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

const setup = async () => {
  const transfers = new InMemoryTransferRepository();
  const assets = new InMemoryAssetRepository();
  const investors = new InMemoryInvestorRepository();
  const transferrer = new FakeAssetTokenTransferrer();
  const events = new RecordingAssetEventLog();
  const clock = new FixedClock(NOW);
  await assets.save(tokenizedAsset());
  await investors.save(investorIn("alice", "approved"));
  await investors.save(investorIn("bob", "approved"));
  await investors.save(investorIn("carol", "draft")); // not KYC-eligible
  transferrer.credit("alice", 100n);
  return {
    transfers,
    assets,
    investors,
    transferrer,
    events,
    transferTokens: new TransferTokens(
      transfers,
      investors,
      assets,
      transferrer,
      new SequentialIdGenerator(),
      events,
      clock,
    ),
    listTransfers: new ListTransfers(transfers),
  };
};

describe("TransferTokens (FR-TR-1)", () => {
  it("moves_tokens_between_two_verified_holders_and_records_it", async () => {
    const s = await setup();

    const { transferId } = await s.transferTokens.execute({
      assetId: "asset-1",
      fromInvestorId: "alice",
      toInvestorId: "bob",
      tokens: 25n,
    });

    expect(transferId).toBeDefined();
    expect(s.transferrer.transfers).toEqual([{ from: "alice", to: "bob", tokens: 25n }]);
    expect(await s.transferrer.balanceOf("0xTok1", "alice")).toBe(75n);
    expect(await s.transferrer.balanceOf("0xTok1", "bob")).toBe(25n);
    expect(s.events.events.at(-1)).toMatchObject({
      assetId: "asset-1",
      event: "tokens_transferred",
      actor: "alice",
    });
  });

  it("rejects_a_transfer_to_self", async () => {
    const s = await setup();
    await expect(
      s.transferTokens.execute({
        assetId: "asset-1",
        fromInvestorId: "alice",
        toInvestorId: "alice",
        tokens: 10n,
      }),
    ).rejects.toThrow(InvalidTransferError);
  });

  it("rejects_when_the_sender_lacks_enough_tokens_without_touching_the_chain", async () => {
    const s = await setup();
    await expect(
      s.transferTokens.execute({
        assetId: "asset-1",
        fromInvestorId: "alice",
        toInvestorId: "bob",
        tokens: 500n,
      }),
    ).rejects.toThrow(InsufficientTokenBalanceError);
    expect(s.transferrer.transfers).toEqual([]);
  });

  it("rejects_an_ineligible_recipient_before_the_chain", async () => {
    const s = await setup();
    await expect(
      s.transferTokens.execute({
        assetId: "asset-1",
        fromInvestorId: "alice",
        toInvestorId: "carol",
        tokens: 10n,
      }),
    ).rejects.toThrow(TransferNotAllowedError);
    expect(s.transferrer.transfers).toEqual([]);
  });

  it("rejects_an_ineligible_sender", async () => {
    const s = await setup();
    s.transferrer.credit("carol", 50n);
    await expect(
      s.transferTokens.execute({
        assetId: "asset-1",
        fromInvestorId: "carol",
        toInvestorId: "bob",
        tokens: 10n,
      }),
    ).rejects.toThrow(TransferNotAllowedError);
  });

  it("surfaces_an_on_chain_compliance_rejection_and_records_nothing", async () => {
    const s = await setup();
    s.transferrer.rejectRecipients.add("bob"); // chain refuses this recipient

    await expect(
      s.transferTokens.execute({
        assetId: "asset-1",
        fromInvestorId: "alice",
        toInvestorId: "bob",
        tokens: 10n,
      }),
    ).rejects.toThrow(/rejected on-chain/);
    expect(await s.listTransfers.executeForAsset({ assetId: "asset-1" })).toEqual([]);
  });

  it("rejects_an_unknown_or_non_tokenized_asset", async () => {
    const s = await setup();
    await expect(
      s.transferTokens.execute({
        assetId: "ghost",
        fromInvestorId: "alice",
        toInvestorId: "bob",
        tokens: 10n,
      }),
    ).rejects.toThrow(AssetNotFoundError);
  });

  it("rejects_an_unknown_investor", async () => {
    const s = await setup();
    await expect(
      s.transferTokens.execute({
        assetId: "asset-1",
        fromInvestorId: "nobody",
        toInvestorId: "bob",
        tokens: 10n,
      }),
    ).rejects.toThrow(InvestorNotFoundError);
  });
});

describe("ListTransfers", () => {
  it("lists_transfers_for_an_investor_as_views", async () => {
    const s = await setup();
    await s.transferTokens.execute({
      assetId: "asset-1",
      fromInvestorId: "alice",
      toInvestorId: "bob",
      tokens: 25n,
    });

    const forBob = await s.listTransfers.executeForInvestor({ investorId: "bob" });
    expect(forBob).toHaveLength(1);
    expect(forBob[0]).toMatchObject({
      assetId: "asset-1",
      fromInvestorId: "alice",
      toInvestorId: "bob",
      tokens: "25",
    });
  });
});

describe("TransferTokens — asset must be tokenized", () => {
  it("rejects_a_non_tokenized_asset", async () => {
    const s = await setup();
    await s.assets.save(
      Asset.restore({
        id: "asset-2",
        name: "Draft Plot",
        type: "asset_backed",
        state: "approved",
        dossier: LegalDossier.empty(),
        checklist: OnboardingChecklist.empty(),
        custody: undefined,
      }),
    );
    await expect(
      s.transferTokens.execute({
        assetId: "asset-2",
        fromInvestorId: "alice",
        toInvestorId: "bob",
        tokens: 10n,
      }),
    ).rejects.toThrow(AssetNotTokenizedForTransferError);
  });
});
