import { InvalidRealEstateProfileError } from "./errors.js";

// PROVISIONAL, like the rights catalogue: a workable split for the pilot, not a
// claim about how any registry classifies property. REQUIRES LOCAL VALIDATION.
export const PROPERTY_TYPES = ["residential", "commercial", "industrial", "land"] as const;

export type PropertyType = (typeof PROPERTY_TYPES)[number];

// The oldest plausible build year. A typo like "900" is far likelier than a
// tokenised eleventh-century building, and a wrong year misleads a valuation.
const EARLIEST_BUILD_YEAR = 1200;

// The facts that make an asset a particular building rather than an idea.
// Every field is checkable against a document — which is the point: this is
// what an officer, and later a regulator, matches the dossier against.
export class RealEstateProfile {
  private constructor(
    public readonly addressLine: string,
    public readonly city: string,
    public readonly propertyType: PropertyType,
    public readonly areaSquareMetres: number,
    // The thread back to the legal right. Without it there is nothing to
    // enforce, so it is required rather than nice to have.
    public readonly titleReference: string,
    public readonly builtInYear: number | undefined,
  ) {}

  static of(fields: {
    addressLine: string;
    city: string;
    propertyType: PropertyType;
    areaSquareMetres: number;
    titleReference: string;
    builtInYear?: number;
  }): RealEstateProfile {
    const addressLine = required(fields.addressLine, "a property needs an address");
    const city = required(fields.city, "a property needs a city");
    const titleReference = required(fields.titleReference, "a property needs a title reference");

    if (!Number.isInteger(fields.areaSquareMetres) || fields.areaSquareMetres <= 0) {
      throw new InvalidRealEstateProfileError(
        "area must be a positive whole number of square metres",
      );
    }
    if (
      fields.builtInYear !== undefined &&
      (!Number.isInteger(fields.builtInYear) || fields.builtInYear < EARLIEST_BUILD_YEAR)
    ) {
      throw new InvalidRealEstateProfileError(
        `a build year before ${String(EARLIEST_BUILD_YEAR)} is a typo, not a building`,
      );
    }

    return new RealEstateProfile(
      addressLine,
      city,
      fields.propertyType,
      fields.areaSquareMetres,
      titleReference,
      fields.builtInYear,
    );
  }
}

const required = (value: string, message: string): string => {
  const trimmed = value.trim();
  if (trimmed === "") {
    throw new InvalidRealEstateProfileError(message);
  }
  return trimmed;
};
