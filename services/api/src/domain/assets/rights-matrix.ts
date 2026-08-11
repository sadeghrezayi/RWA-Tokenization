import { InvalidRightError, UnknownRightError } from "./errors.js";

// PROVISIONAL. This catalogue is the SHAPE of the question — what a token
// conveys — not an answer to it. Which rights a real-world instrument actually
// grants, and what wording makes them enforceable, is jurisdiction- and
// deal-specific and REQUIRES LOCAL LEGAL VALIDATION. Nothing here asserts that
// any of these can be granted, or that this list is complete.
//
// Kept in ONE place so the set can be replaced without touching anything that
// reads a matrix (same posture as the onboarding field set, 2.3e).
export const RIGHTS_ARE_PROVISIONAL = true;

export const RIGHT_KINDS = [
  // A share of what the asset earns while it is held.
  "income",
  // A share of the proceeds when the asset is sold.
  "disposal_proceeds",
  // A say in decisions the holders are entitled to vote on.
  "voting",
  // A right to use or occupy the asset itself.
  "use",
  // A claim on the asset's value on wind-up, after prior claims.
  "residual_value",
] as const;

export type RightKind = (typeof RIGHT_KINDS)[number];

export interface ConveyedRight {
  kind: RightKind;
  // The wording the right was granted in — a clause reference or a plain
  // description. A bare "yes" would claim more precision than the underlying
  // document supports.
  note: string;
}

const isRightKind = (value: string): value is RightKind =>
  (RIGHT_KINDS as readonly string[]).includes(value);

// What a token conveys to whoever holds it, one asset at a time.
//
// The default is NOTHING. Silence must never read as a granted right: an empty
// matrix means the rights have not been established, which is a different
// statement from "this token grants no rights" and is treated as such by
// isEstablished().
export class RightsMatrix {
  private constructor(private readonly rights: readonly ConveyedRight[]) {}

  static empty(): RightsMatrix {
    return new RightsMatrix([]);
  }

  static restore(rights: readonly ConveyedRight[]): RightsMatrix {
    return new RightsMatrix([...rights]);
  }

  convey(kind: string, note: string): RightsMatrix {
    if (!isRightKind(kind)) {
      throw new UnknownRightError(kind);
    }
    if (note.trim() === "") {
      throw new InvalidRightError("a conveyed right needs the wording it was granted in");
    }
    return new RightsMatrix([
      ...this.rights.filter((right) => right.kind !== kind),
      { kind, note: note.trim() },
    ]);
  }

  withhold(kind: string): RightsMatrix {
    if (!isRightKind(kind)) {
      throw new UnknownRightError(kind);
    }
    return new RightsMatrix(this.rights.filter((right) => right.kind !== kind));
  }

  conveys(kind: RightKind): boolean {
    return this.rights.some((right) => right.kind === kind);
  }

  noteFor(kind: RightKind): string | undefined {
    return this.rights.find((right) => right.kind === kind)?.note;
  }

  conveyed(): readonly ConveyedRight[] {
    return this.rights;
  }

  // Whether anyone has established what this token conveys. An asset with an
  // unestablished matrix has not answered the platform's central question.
  isEstablished(): boolean {
    return this.rights.length > 0;
  }
}
