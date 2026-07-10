import { InvalidCustodyArrangementError } from "./errors.js";

// FR-AO-3: who holds the underlying asset, and where.
export class CustodyArrangement {
  private constructor(
    public readonly custodianName: string,
    public readonly location: string,
  ) {}

  static of(fields: { custodianName: string; location: string }): CustodyArrangement {
    const custodianName = fields.custodianName.trim();
    const location = fields.location.trim();
    if (custodianName === "" || location === "") {
      throw new InvalidCustodyArrangementError(
        "a custody arrangement needs both a custodian name and a location",
      );
    }
    return new CustodyArrangement(custodianName, location);
  }
}
