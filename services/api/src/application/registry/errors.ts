import { ApplicationError } from "../identity/errors.js";

export class AssetNotTokenizedForRegistryError extends ApplicationError {
  constructor(assetId: string) {
    super(`asset "${assetId}" has no token — a holder registry exists only after tokenization`);
  }
}
