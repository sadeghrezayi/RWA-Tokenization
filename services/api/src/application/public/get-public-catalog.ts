import type { Offering } from "../../domain/offerings/offering.js";
import type { AssetRepository } from "../assets/ports.js";
import type { OfferingRepository } from "../offerings/ports.js";

// What an ANONYMOUS visitor may see about an offering (OD-5: public catalog,
// gated subscription).
//
// Deliberately factual only — attested or contractual terms, nothing
// forward-looking. Per OD-21 no projected yield or expected return appears
// here: a projection is a regulated financial promotion and none has an
// approved methodology. The published page content itself still REQUIRES LOCAL
// LEGAL VALIDATION before a real launch.
//
// It is also deliberately narrow: subscriber identities, holdings and
// allocations never cross into a public view, so the type simply has nowhere to
// put them.
export interface PublicOfferingView {
  id: string;
  assetId: string;
  assetName: string;
  supply: string;
  priceRial: string;
  minPerInvestor: string;
  maxPerInvestor: string;
  opensAt: string;
  closesAt: string;
  publishedAt: string;
}

// 2.1a: the public catalog. Shows only offerings an operator has deliberately
// published AND that are still open — see Offering.isPubliclyListed().
export class GetPublicCatalog {
  constructor(
    private readonly offerings: OfferingRepository,
    private readonly assets: AssetRepository,
  ) {}

  async list(): Promise<PublicOfferingView[]> {
    const listed = (await this.offerings.findAll()).filter((o) => o.isPubliclyListed());
    return Promise.all(listed.map((offering) => this.toView(offering)));
  }

  // Undefined rather than an error for an unlisted offering: publicly it simply
  // does not exist, and a distinct "forbidden" would confirm that the id is real.
  async byId(offeringId: string): Promise<PublicOfferingView | undefined> {
    const offering = await this.offerings.findById(offeringId);
    if (!offering?.isPubliclyListed()) {
      return undefined;
    }
    return this.toView(offering);
  }

  private async toView(offering: Offering): Promise<PublicOfferingView> {
    const asset = await this.assets.findById(offering.assetId);
    return {
      id: offering.id,
      assetId: offering.assetId,
      assetName: asset?.name ?? `Asset ${offering.assetId.slice(0, 8)}`,
      supply: String(offering.supply),
      priceRial: String(offering.priceRial),
      minPerInvestor: String(offering.minPerInvestor),
      maxPerInvestor: String(offering.maxPerInvestor),
      opensAt: offering.opensAt.toISOString(),
      closesAt: offering.closesAt.toISOString(),
      // Non-null by construction: isPubliclyListed() requires publishedAt.
      publishedAt: (offering.publishedAt ?? new Date(0)).toISOString(),
    };
  }
}
