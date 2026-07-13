import { TokenTransfer } from "../../domain/transfers/token-transfer.js";
import { loadAsset } from "../assets/load-asset.js";
import type { AssetEventLog, AssetRepository } from "../assets/ports.js";
import { loadInvestor } from "../identity/load-investor.js";
import type { InvestorRepository, IdGenerator } from "../identity/ports.js";
import type { Clock } from "../offerings/ports.js";
import {
  AssetNotTokenizedForTransferError,
  InsufficientTokenBalanceError,
  TransferNotAllowedError,
} from "./errors.js";
import type { AssetTokenTransferrer, TransferRepository } from "./ports.js";

// FR-TR-1: a holder transfers tokens to another eligible holder. Application
// pre-checks (eligibility, balance, self, tokenized) fail fast; the ERC-3643
// token is the ultimate compliance authority — an ineligible recipient reverts
// on-chain and nothing is recorded.
export class TransferTokens {
  constructor(
    private readonly transfers: TransferRepository,
    private readonly investors: InvestorRepository,
    private readonly assets: AssetRepository,
    private readonly transferrer: AssetTokenTransferrer,
    private readonly ids: IdGenerator,
    private readonly events: AssetEventLog,
    private readonly clock: Clock,
  ) {}

  async execute(input: {
    assetId: string;
    fromInvestorId: string;
    toInvestorId: string;
    tokens: bigint;
  }): Promise<{ transferId: string }> {
    const from = await loadInvestor(this.investors, input.fromInvestorId);
    const to = await loadInvestor(this.investors, input.toInvestorId);
    if (!from.isEligibleForClaims() || !to.isEligibleForClaims()) {
      throw new TransferNotAllowedError();
    }

    const asset = await loadAsset(this.assets, input.assetId);
    if (asset.state !== "tokenized" || asset.tokenAddress === undefined) {
      throw new AssetNotTokenizedForTransferError(asset.id);
    }

    // Validate the transfer shape (positive amount, not self) before any I/O.
    const transfer = TokenTransfer.record({
      id: this.ids.nextId(),
      assetId: asset.id,
      tokenAddress: asset.tokenAddress,
      fromInvestorId: input.fromInvestorId,
      toInvestorId: input.toInvestorId,
      tokens: input.tokens,
      executedAt: this.clock.now(),
    });

    const balance = await this.transferrer.balanceOf(asset.tokenAddress, input.fromInvestorId);
    if (balance < input.tokens) {
      throw new InsufficientTokenBalanceError();
    }

    await this.transferrer.transfer(
      asset.tokenAddress,
      input.fromInvestorId,
      input.toInvestorId,
      input.tokens,
    );
    await this.transfers.save(transfer);
    await this.events.append({
      assetId: asset.id,
      event: "tokens_transferred",
      actor: input.fromInvestorId,
      details: {
        transferId: transfer.id,
        to: input.toInvestorId,
        tokens: String(input.tokens),
      },
    });
    return { transferId: transfer.id };
  }
}
