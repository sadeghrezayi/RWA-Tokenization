import { describe, expect, it } from "vitest";
import {
  GetInvestorDetail,
  ListInvestors,
} from "../../../src/application/identity/investor-directory.js";
import { GetMyHoldings } from "../../../src/application/transfers/get-holdings.js";
import { InvestorNotFoundError } from "../../../src/application/identity/errors.js";
import type {
  InvestorChainDirectory,
  InvestorChainInfo,
  LedgerReader,
} from "../../../src/application/identity/ports.js";
import { Asset } from "../../../src/domain/assets/asset.js";
import { LegalDossier } from "../../../src/domain/assets/legal-dossier.js";
import { OnboardingChecklist } from "../../../src/domain/assets/onboarding-checklist.js";
import { EmailAddress } from "../../../src/domain/identity/email-address.js";
import { Investor } from "../../../src/domain/identity/investor.js";
import { KycStatus } from "../../../src/domain/identity/kyc-status.js";
import { PasswordHash } from "../../../src/domain/identity/password-hash.js";
import type { KycState } from "../../../src/domain/identity/kyc-status.js";
import { Redemption } from "../../../src/domain/redemptions/redemption.js";
import { TokenTransfer } from "../../../src/domain/transfers/token-transfer.js";
import { InMemoryAssetRepository } from "../../fakes/asset-fakes.js";
import { InMemoryInvestorRepository } from "../../fakes/identity-fakes.js";
import { InMemoryRedemptionRepository } from "../../fakes/redemption-fakes.js";
import {
  FakeAssetTokenTransferrer,
  InMemoryTransferRepository,
} from "../../fakes/transfer-fakes.js";

const T1 = new Date("2026-07-10T00:00:00Z");
const T2 = new Date("2026-07-12T00:00:00Z");

const investor = (id: string, email: string, state: KycState) =>
  Investor.restore(
    id,
    EmailAddress.of(email),
    PasswordHash.of("hashed:pw"),
    KycStatus.restore(state),
  );

const tokenizedAsset = (id: string, name: string) =>
  Asset.restore({
    id,
    name,
    type: "asset_backed",
    state: "tokenized",
    dossier: LegalDossier.empty(),
    checklist: OnboardingChecklist.empty(),
    custody: undefined,
    tokenAddress: `0xTok-${id}`,
  });

class StubLedger implements LedgerReader {
  private readonly balances = new Map<string, { balanceRial: bigint; heldRial: bigint }>();
  set(id: string, balanceRial: bigint, heldRial: bigint) {
    this.balances.set(id, { balanceRial, heldRial });
  }
  balanceOf(id: string): Promise<{ balanceRial: bigint; heldRial: bigint }> {
    return Promise.resolve(this.balances.get(id) ?? { balanceRial: 0n, heldRial: 0n });
  }
}

class StubChainDirectory implements InvestorChainDirectory {
  private readonly info = new Map<string, InvestorChainInfo>();
  set(id: string, info: InvestorChainInfo) {
    this.info.set(id, info);
  }
  forInvestor(id: string): Promise<InvestorChainInfo> {
    return Promise.resolve(this.info.get(id) ?? {});
  }
}

const setup = async () => {
  const investors = new InMemoryInvestorRepository();
  const assets = new InMemoryAssetRepository();
  const ledger = new StubLedger();
  const chainDir = new StubChainDirectory();
  const chain = new FakeAssetTokenTransferrer();
  const transfers = new InMemoryTransferRepository();
  const redemptions = new InMemoryRedemptionRepository();

  await investors.save(investor("sara", "sara@demo.com", "approved"));
  await investors.save(investor("bob", "bob@demo.com", "approved"));
  await investors.save(investor("carol", "carol@demo.com", "draft"));
  await assets.save(tokenizedAsset("asset-1", "Vanak Tower SPV"));
  ledger.set("sara", 1_250_140_000n, 0n);
  ledger.set("bob", 160_000n, 40_000n);
  chainDir.set("sara", { identityAddress: "0xIdSara", walletAddress: "0xWalSara" });
  chain.credit("sara", 35n);

  await transfers.save(
    TokenTransfer.record({
      id: "tr-1",
      assetId: "asset-1",
      tokenAddress: "0xTok-asset-1",
      fromInvestorId: "sara",
      toInvestorId: "bob",
      tokens: 15n,
      executedAt: T1,
    }),
  );
  await transfers.save(
    TokenTransfer.record({
      id: "tr-2",
      assetId: "ghost-asset",
      tokenAddress: "0xTokGhost",
      fromInvestorId: "ghost",
      toInvestorId: "sara",
      tokens: 5n,
      executedAt: T2,
    }),
  );
  await redemptions.save(
    Redemption.request({
      id: "red-1",
      assetId: "asset-1",
      tokenAddress: "0xTok-asset-1",
      investorId: "sara",
      tokens: 10n,
      requestedAt: T1,
    }).fulfill(1_250_000_000n, T2),
  );

  return {
    list: new ListInvestors(investors, ledger),
    detail: new GetInvestorDetail(
      investors,
      assets,
      ledger,
      chainDir,
      new GetMyHoldings(assets, chain),
      transfers,
      redemptions,
    ),
  };
};

describe("ListInvestors (FR-PT-3 directory)", () => {
  it("lists_every_investor_with_kyc_and_ledger_balances_sorted_by_email", async () => {
    const s = await setup();

    const list = await s.list.execute();

    expect(list.map((e) => e.email)).toEqual(["bob@demo.com", "carol@demo.com", "sara@demo.com"]);
    expect(list[0]).toMatchObject({
      kycState: "approved",
      eligibleForClaims: true,
      balanceRial: "160000",
      heldRial: "40000",
    });
    expect(list[1]).toMatchObject({ kycState: "draft", balanceRial: "0" });
    // Never leak credentials.
    expect(JSON.stringify(list)).not.toContain("hashed:pw");
  });
});

describe("GetInvestorDetail (FR-PT-3 user drill-down)", () => {
  it("aggregates_identity_chain_ledger_and_portfolio", async () => {
    const s = await setup();

    const detail = await s.detail.execute({ investorId: "sara" });

    expect(detail.investor).toMatchObject({ email: "sara@demo.com", kycState: "approved" });
    expect(detail.chain).toEqual({ identityAddress: "0xIdSara", walletAddress: "0xWalSara" });
    expect(detail.ledger).toEqual({ balanceRial: "1250140000", heldRial: "0" });
    expect(detail.holdings).toEqual([
      {
        assetId: "asset-1",
        assetName: "Vanak Tower SPV",
        tokenAddress: "0xTok-asset-1",
        tokens: "35",
      },
    ]);
  });

  it("maps_transfers_newest_first_with_direction_and_counterparty_emails", async () => {
    const s = await setup();

    const { transfers } = await s.detail.execute({ investorId: "sara" });

    expect(transfers).toEqual([
      {
        id: "tr-2",
        direction: "received",
        counterparty: "ghost",
        assetName: "ghost-asset",
        tokens: "5",
        at: T2.toISOString(),
      },
      {
        id: "tr-1",
        direction: "sent",
        counterparty: "bob@demo.com",
        assetName: "Vanak Tower SPV",
        tokens: "15",
        at: T1.toISOString(),
      },
    ]);
  });

  it("lists_redemptions_with_asset_names_and_payouts", async () => {
    const s = await setup();

    const { redemptions } = await s.detail.execute({ investorId: "sara" });

    expect(redemptions).toEqual([
      {
        id: "red-1",
        assetName: "Vanak Tower SPV",
        tokens: "10",
        state: "fulfilled",
        requestedAt: T1.toISOString(),
        payoutRial: "1250000000",
      },
    ]);
  });

  it("returns_empty_chain_info_and_histories_for_a_fresh_user", async () => {
    const s = await setup();

    const detail = await s.detail.execute({ investorId: "carol" });

    expect(detail.chain).toEqual({});
    expect(detail.holdings).toEqual([]);
    expect(detail.transfers).toEqual([]);
    expect(detail.redemptions).toEqual([]);
  });

  it("rejects_an_unknown_investor", async () => {
    const s = await setup();
    await expect(s.detail.execute({ investorId: "missing" })).rejects.toThrow(
      InvestorNotFoundError,
    );
  });
});
