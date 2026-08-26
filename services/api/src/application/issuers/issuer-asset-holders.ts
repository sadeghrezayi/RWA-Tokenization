import { createHash } from "node:crypto";
import { NotIssuerTeamMemberError } from "./errors.js";
import type { HolderRegistryView } from "../registry/get-holder-registry.js";

// P1-2 / FR-PT-2: the holder registry an issuer sees for an asset THEY brought.
//
// The field list implements docs/proposals/issuer-investor-visibility.md. It is
// deliberately narrower than the admin registry: no email, no wallet, no
// investor id. See that document for what was excluded and why — this file
// enforces the decision, it does not make it.

// A per-ASSET pseudonymous handle for a holder.
//
// Per-asset, not per-platform, on purpose: a raw wallet address is permanent and
// the same address holds that investor's positions in every other asset on the
// chain, so handing issuers a stable global identifier would let two of them
// compare notes and discover they share a holder. Salting with the asset id
// means the same person looks like different holders to different issuers,
// while staying consistent to one issuer over time.
//
// Pseudonymisation, not anonymisation: someone who already knows an investor id
// can hash it against a known asset and match. It stops correlation, not a
// targeted check by someone holding the platform's own identifiers.
export const holderReferenceFor = (assetId: string, subject: string): string =>
  createHash("sha256").update(`${assetId}:${subject}`).digest("hex").slice(0, 16);

export interface IssuerHolderView {
  holderReference: string;
  tokens: string;
  shareBps: number;
  holderSince: string;
  // Absent — never zero — when the platform holds no allocation for this
  // holder. Zero would read as "invested nothing", which is a different claim.
  tokensAllocated?: string;
  amountInvestedRial?: string;
  amountRefundedRial?: string;
  allocationDate?: string;
}

export interface IssuerHoldersView {
  assetId: string;
  assetName: string;
  holders: IssuerHolderView[];
}

export interface IssuerAllocationRow {
  investorId: string;
  allocated: bigint;
  costRial: bigint;
  refundRial: bigint;
  at: Date;
}

export interface IssuerAllocationReader {
  forAsset(assetId: string): Promise<IssuerAllocationRow[]>;
}

interface HolderRegistrySource {
  execute(input: { assetId: string }): Promise<HolderRegistryView>;
}

interface AssetOwnerReader {
  organisationOf(assetId: string): Promise<string | undefined>;
}

interface IssuerMembershipCheck {
  assertMember(input: { organisationId: string; userId: string }): Promise<void>;
}

export class GetIssuerAssetHolders {
  constructor(
    private readonly registry: HolderRegistrySource,
    private readonly allocations: IssuerAllocationReader,
    private readonly assets: AssetOwnerReader,
    private readonly access: IssuerMembershipCheck,
  ) {}

  async execute(input: { assetId: string; userId: string }): Promise<IssuerHoldersView> {
    const organisationId = await this.assets.organisationOf(input.assetId);
    if (organisationId === undefined) {
      // A NULL owner means the PLATFORM onboarded this asset, not that it is
      // unowned — reading it as "no restriction" would open every staff-
      // onboarded asset to any issuer who asked.
      throw new NotIssuerTeamMemberError();
    }
    await this.access.assertMember({ organisationId, userId: input.userId });

    const registry = await this.registry.execute({ assetId: input.assetId });
    const invested = this.byInvestor(await this.allocations.forAsset(input.assetId));

    return {
      assetId: registry.assetId,
      assetName: registry.assetName,
      holders: registry.holders.map((holder) => {
        // An ALLOW-LIST, built field by field. Never a spread or an omit: the
        // source is the admin view, and a field added there later must not be
        // able to arrive here just because nobody remembered to exclude it.
        const base: IssuerHolderView = {
          // Falls back to the wallet as the hashed subject when the platform
          // cannot name the holder — so an unknown holder still appears, with
          // no address disclosed. The registry's own rule is that a holder is
          // never silently dropped.
          holderReference: holderReferenceFor(
            input.assetId,
            holder.investorId ?? holder.wallet.toLowerCase(),
          ),
          tokens: holder.tokens,
          shareBps: holder.shareBps,
          holderSince: holder.since,
        };
        const allocation =
          holder.investorId === undefined ? undefined : invested.get(holder.investorId);
        if (allocation === undefined) {
          return base;
        }
        return {
          ...base,
          tokensAllocated: String(allocation.allocated),
          amountInvestedRial: String(allocation.costRial),
          amountRefundedRial: String(allocation.refundRial),
          allocationDate: allocation.at.toISOString(),
        };
      }),
    };
  }

  // One asset can raise more than once, so a holder may have several
  // allocations. "Amount invested" means into THIS ASSET — summed, not the
  // first row that happened to be read — and the date is the EARLIEST, which is
  // when they first backed it.
  private byInvestor(rows: readonly IssuerAllocationRow[]): Map<string, IssuerAllocationRow> {
    const totals = new Map<string, IssuerAllocationRow>();
    for (const row of rows) {
      const running = totals.get(row.investorId);
      totals.set(
        row.investorId,
        running === undefined
          ? { ...row }
          : {
              investorId: row.investorId,
              allocated: running.allocated + row.allocated,
              costRial: running.costRial + row.costRial,
              refundRial: running.refundRial + row.refundRial,
              at: row.at < running.at ? row.at : running.at,
            },
      );
    }
    return totals;
  }
}
