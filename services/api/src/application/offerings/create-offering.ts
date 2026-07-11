import { Offering } from "../../domain/offerings/offering.js";
import { loadAsset } from "../assets/load-asset.js";
import type { AssetEventLog, AssetRepository } from "../assets/ports.js";
import type { IdGenerator } from "../identity/ports.js";
import { AssetNotTokenizedError } from "./errors.js";
import type { OfferingRepository } from "./ports.js";

export class CreateOffering {
  constructor(
    private readonly offerings: OfferingRepository,
    private readonly assets: AssetRepository,
    private readonly ids: IdGenerator,
    private readonly events: AssetEventLog,
  ) {}

  async execute(input: {
    assetId: string;
    supply: bigint;
    priceRial: bigint;
    minPerInvestor: bigint;
    maxPerInvestor: bigint;
    minimumRaise: bigint;
    opensAt: Date;
    closesAt: Date;
    actor: string;
  }): Promise<{ offeringId: string }> {
    const asset = await loadAsset(this.assets, input.assetId);
    // P1 legal-before-token holds transitively: only a tokenized asset (which
    // required the approved dossier) can be offered.
    if (asset.state !== "tokenized" || asset.tokenAddress === undefined) {
      throw new AssetNotTokenizedError(asset.id);
    }
    const offering = Offering.create({
      id: this.ids.nextId(),
      assetId: asset.id,
      tokenAddress: asset.tokenAddress,
      supply: input.supply,
      priceRial: input.priceRial,
      minPerInvestor: input.minPerInvestor,
      maxPerInvestor: input.maxPerInvestor,
      minimumRaise: input.minimumRaise,
      opensAt: input.opensAt,
      closesAt: input.closesAt,
    });
    await this.offerings.save(offering);
    await this.events.append({
      assetId: asset.id,
      event: "offering_created",
      actor: input.actor,
      details: { offeringId: offering.id },
    });
    return { offeringId: offering.id };
  }
}
