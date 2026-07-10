import { ApplicationError } from "../identity/errors.js";

export class AssetNotFoundError extends ApplicationError {
  constructor(assetId: string) {
    super(`no asset found with id "${assetId}"`);
  }
}

export class EmptyDocumentError extends ApplicationError {
  constructor() {
    super("a dossier document must have non-empty content");
  }
}
