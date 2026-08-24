import { UnresolvedMintError } from "./errors.js";
import type { AllocationMintLog, AssetTokenIssuer } from "./ports.js";

// P0-2 step 1: issue one allocation's tokens, at most once.
//
// `AssetTokenIssuer.mint` puts tokens on the chain unconditionally, and until
// now nothing recorded that it had run. Closing an offering twice, or — once
// step 2 moves this onto the outbox — a redelivered message, would issue the
// tokens again. That is not a glitch to shrug at: it inflates the asset's
// supply against the holder registry an auditor reconciles it with (FR-RA-4).
//
// Its own use case rather than a private method on CloseOffering, because the
// outbox handler in step 2 needs to invoke exactly this and nothing else.
export class MintAllocation {
  constructor(
    private readonly issuer: AssetTokenIssuer,
    private readonly mints: AllocationMintLog,
  ) {}

  async execute(input: {
    offeringId: string;
    tokenAddress: string;
    investorId: string;
    tokens: bigint;
  }): Promise<void> {
    const key = { offeringId: input.offeringId, investorId: input.investorId };
    const state = await this.mints.stateOf(key);

    if (state === "minted") {
      // The idempotent no-op the whole record exists to make possible.
      return;
    }
    if (state === "unresolved") {
      // An attempt was claimed and never confirmed, so nobody knows whether the
      // chain took it. Minting again may double-issue; skipping leaves a holder
      // who paid with nothing and nothing to complain about. Neither is safe to
      // choose automatically, so it stops and names what must be reconciled.
      throw new UnresolvedMintError(input.offeringId, input.investorId);
    }

    // Claimed BEFORE the chain is touched: a concurrent redelivery loses the
    // race here rather than both of them minting.
    if (!(await this.mints.claim(key, input.tokens))) {
      return;
    }
    await this.issuer.mint(input.tokenAddress, input.investorId, input.tokens);
    await this.mints.confirm(key);
  }
}
