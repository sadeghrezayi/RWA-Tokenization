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

export class InvalidTokenSymbolError extends ApplicationError {
  constructor() {
    super("a token symbol must be 2-11 uppercase letters or digits");
  }
}

export class NoPositionInAssetError extends ApplicationError {
  constructor(assetId: string) {
    super(`you hold no position in asset "${assetId}"`);
  }
}

// 3.3: an organisation that has not been approved — or has been suspended —
// cannot have assets submitted in its name. Named by legal name and state, not
// by id: the person reading this is looking at a list of organisations.
export class IssuerCannotSubmitAssetsError extends ApplicationError {
  constructor(legalName: string, state: string) {
    super(`"${legalName}" may not submit assets while it is ${state}`);
  }
}

// 3.3i: the boundary between issuers. A membership grants power over YOUR
// organisation's assets and nobody else's — and an asset the platform brought
// itself belongs to no organisation, so it belongs to none of them. The
// message names neither id: the reader is the person being refused, and the
// asset they asked about is already on their screen (K-19).
export class AssetNotBroughtByOrganisationError extends ApplicationError {
  constructor() {
    super("this asset was not brought by your organisation");
  }
}

// K-33: a bound on what the dossier will hold. Same 10 MB the KYC evidence
// path uses — one platform, one answer to "how big may a document be".
export class DossierDocumentTooLargeError extends ApplicationError {
  constructor(maxBytes: number) {
    super(`a dossier document may be at most ${String(Math.floor(maxBytes / (1024 * 1024)))} MB`);
  }
}
