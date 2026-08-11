import { describe, expect, it } from "vitest";
import { RealEstateProfile } from "../../../src/domain/assets/real-estate-profile.js";
import { InvalidRealEstateProfileError } from "../../../src/domain/assets/errors.js";

const valid = {
  addressLine: "Plot 14, Vanak Street",
  city: "Tehran",
  propertyType: "residential" as const,
  areaSquareMetres: 240,
  titleReference: "TR-1990-4471",
};

// 3.1: the facts that make an asset a particular building rather than an idea.
// Every one of these is checkable against a document, which is the point — they
// are what an officer and later a regulator match the dossier against.
describe("RealEstateProfile", () => {
  it("records the property a token is issued against", () => {
    const profile = RealEstateProfile.of(valid);

    expect(profile.addressLine).toBe("Plot 14, Vanak Street");
    expect(profile.city).toBe("Tehran");
    expect(profile.propertyType).toBe("residential");
    expect(profile.areaSquareMetres).toBe(240);
    expect(profile.titleReference).toBe("TR-1990-4471");
  });

  it("refuses a property with no address", () => {
    // An asset nobody can locate cannot be inspected, valued or repossessed.
    expect(() => RealEstateProfile.of({ ...valid, addressLine: "  " })).toThrow(
      InvalidRealEstateProfileError,
    );
  });

  it("refuses a property with no title reference", () => {
    // The title is the thread back to the legal right; without it there is
    // nothing to enforce.
    expect(() => RealEstateProfile.of({ ...valid, titleReference: "" })).toThrow(
      InvalidRealEstateProfileError,
    );
  });

  it("refuses an area that is not a positive whole number of square metres", () => {
    expect(() => RealEstateProfile.of({ ...valid, areaSquareMetres: 0 })).toThrow(
      InvalidRealEstateProfileError,
    );
    expect(() => RealEstateProfile.of({ ...valid, areaSquareMetres: -5 })).toThrow(
      InvalidRealEstateProfileError,
    );
    expect(() => RealEstateProfile.of({ ...valid, areaSquareMetres: 12.5 })).toThrow(
      InvalidRealEstateProfileError,
    );
  });

  it("keeps an optional build year only when it is plausible", () => {
    expect(RealEstateProfile.of({ ...valid, builtInYear: 1998 }).builtInYear).toBe(1998);
    expect(() => RealEstateProfile.of({ ...valid, builtInYear: 900 })).toThrow(
      InvalidRealEstateProfileError,
    );
  });

  it("trims what a human typed rather than storing their whitespace", () => {
    const profile = RealEstateProfile.of({ ...valid, addressLine: "  Plot 14  " });

    expect(profile.addressLine).toBe("Plot 14");
  });
});
