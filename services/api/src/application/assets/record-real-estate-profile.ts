import { RealEstateProfile } from "../../domain/assets/real-estate-profile.js";
import type { PropertyType } from "../../domain/assets/real-estate-profile.js";
import { loadAsset } from "./load-asset.js";
import type { AssetEventLog, AssetRepository } from "./ports.js";

// 3.1: the property a token is issued against. Recorded while the asset is
// still being structured — after approval it is frozen with the dossier.
export class RecordRealEstateProfile {
  constructor(
    private readonly assets: AssetRepository,
    private readonly events: AssetEventLog,
  ) {}

  async execute(input: {
    assetId: string;
    addressLine: string;
    city: string;
    propertyType: PropertyType;
    areaSquareMetres: number;
    titleReference: string;
    builtInYear?: number;
    actor: string;
  }): Promise<void> {
    const asset = await loadAsset(this.assets, input.assetId);
    const profile = RealEstateProfile.of({
      addressLine: input.addressLine,
      city: input.city,
      propertyType: input.propertyType,
      areaSquareMetres: input.areaSquareMetres,
      titleReference: input.titleReference,
      ...(input.builtInYear !== undefined ? { builtInYear: input.builtInYear } : {}),
    });
    await this.assets.save(asset.recordRealEstateProfile(profile));
    await this.events.append({
      assetId: input.assetId,
      event: "real_estate_profile_recorded",
      actor: input.actor,
      // The title is the thread back to the legal right, so it belongs in the
      // audit trail; the rest is on the asset itself.
      details: { titleReference: profile.titleReference, city: profile.city },
    });
  }
}
