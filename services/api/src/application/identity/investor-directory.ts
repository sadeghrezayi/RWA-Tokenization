import type { AssetRepository } from "../assets/ports.js";
import type { RedemptionRepository } from "../redemptions/ports.js";
import type { GetMyHoldings, HoldingView } from "../transfers/get-holdings.js";
import type { TransferRepository } from "../transfers/ports.js";
import { toInvestorView } from "./get-investor.js";
import type { InvestorView } from "./get-investor.js";
import { loadInvestor } from "./load-investor.js";
import type {
  InvestorChainDirectory,
  InvestorChainInfo,
  InvestorRepository,
  LedgerReader,
} from "./ports.js";

// FR-PT-3 "user management": the officer's investor directory. The list is
// light (identity + settlement balance); the detail view aggregates everything
// the platform actually knows about one person — KYC, chain footprint,
// portfolio, and transfer/redemption history — named per P2.
export interface InvestorDirectoryEntry extends InvestorView {
  balanceRial: string;
  heldRial: string;
}

export interface InvestorTransferItem {
  id: string;
  direction: "sent" | "received";
  counterparty: string;
  assetName: string;
  tokens: string;
  at: string;
}

export interface InvestorRedemptionItem {
  id: string;
  assetName: string;
  tokens: string;
  state: "requested" | "fulfilled" | "rejected";
  requestedAt: string;
  payoutRial?: string;
  rejectionReason?: string;
}

export interface InvestorDetailView {
  investor: InvestorView;
  chain: InvestorChainInfo;
  ledger: { balanceRial: string; heldRial: string };
  holdings: HoldingView[];
  transfers: InvestorTransferItem[];
  redemptions: InvestorRedemptionItem[];
}

export class ListInvestors {
  constructor(
    private readonly investors: InvestorRepository,
    private readonly ledger: LedgerReader,
  ) {}

  async execute(): Promise<InvestorDirectoryEntry[]> {
    const all = [...(await this.investors.findAll())].sort((a, b) =>
      a.email.value.localeCompare(b.email.value),
    );
    const entries: InvestorDirectoryEntry[] = [];
    for (const investor of all) {
      const { balanceRial, heldRial } = await this.ledger.balanceOf(investor.id);
      entries.push({
        ...toInvestorView(investor),
        balanceRial: String(balanceRial),
        heldRial: String(heldRial),
      });
    }
    return entries;
  }
}

export class GetInvestorDetail {
  constructor(
    private readonly investors: InvestorRepository,
    private readonly assets: AssetRepository,
    private readonly ledger: LedgerReader,
    private readonly chainDirectory: InvestorChainDirectory,
    private readonly holdings: GetMyHoldings,
    private readonly transfers: TransferRepository,
    private readonly redemptions: RedemptionRepository,
  ) {}

  async execute(input: { investorId: string }): Promise<InvestorDetailView> {
    const investor = await loadInvestor(this.investors, input.investorId);
    const { balanceRial, heldRial } = await this.ledger.balanceOf(investor.id);

    // Resolve names once per distinct id; unknown ids stay visible as-is (P2
    // with honesty — never hide a row because a lookup failed).
    const assetNames = new Map<string, string>();
    const assetName = async (assetId: string): Promise<string> => {
      let name = assetNames.get(assetId);
      if (name === undefined) {
        name = (await this.assets.findById(assetId))?.name ?? assetId;
        assetNames.set(assetId, name);
      }
      return name;
    };
    const counterpartyNames = new Map<string, string>();
    const counterparty = async (investorId: string): Promise<string> => {
      let name = counterpartyNames.get(investorId);
      if (name === undefined) {
        name = (await this.investors.findById(investorId))?.email.value ?? investorId;
        counterpartyNames.set(investorId, name);
      }
      return name;
    };

    const transfers: InvestorTransferItem[] = [];
    const byNewest = [...(await this.transfers.findByInvestor(investor.id))].sort(
      (a, b) => b.executedAt.getTime() - a.executedAt.getTime(),
    );
    for (const transfer of byNewest) {
      const sent = transfer.fromInvestorId === investor.id;
      transfers.push({
        id: transfer.id,
        direction: sent ? "sent" : "received",
        counterparty: await counterparty(sent ? transfer.toInvestorId : transfer.fromInvestorId),
        assetName: await assetName(transfer.assetId),
        tokens: String(transfer.tokens),
        at: transfer.executedAt.toISOString(),
      });
    }

    const redemptions: InvestorRedemptionItem[] = [];
    const redemptionsByNewest = [...(await this.redemptions.findByInvestor(investor.id))].sort(
      (a, b) => b.requestedAt.getTime() - a.requestedAt.getTime(),
    );
    for (const redemption of redemptionsByNewest) {
      redemptions.push({
        id: redemption.id,
        assetName: await assetName(redemption.assetId),
        tokens: String(redemption.tokens),
        state: redemption.state,
        requestedAt: redemption.requestedAt.toISOString(),
        ...(redemption.payoutRial !== undefined
          ? { payoutRial: String(redemption.payoutRial) }
          : {}),
        ...(redemption.rejectionReason !== undefined
          ? { rejectionReason: redemption.rejectionReason }
          : {}),
      });
    }

    return {
      investor: toInvestorView(investor),
      chain: await this.chainDirectory.forInvestor(investor.id),
      ledger: { balanceRial: String(balanceRial), heldRial: String(heldRial) },
      holdings: await this.holdings.execute({ investorId: investor.id }),
      transfers,
      redemptions,
    };
  }
}
