import { BadRequestException } from "@nestjs/common";
import { REQUIRED_DOSSIER_KINDS } from "../../domain/assets/legal-dossier.js";
import type { DossierDocumentKind } from "../../domain/assets/legal-dossier.js";

// One definition of "is this a dossier kind?", because two controllers now
// accept one: staff attach through /assets, and the issuer that brought an
// asset attaches through /issuers (3.3i). Two copies would drift the moment a
// seventh kind is added, and the refusal would name a different set depending
// on which door the caller used.
export const asDocumentKind = (raw: string): DossierDocumentKind => {
  if (!(REQUIRED_DOSSIER_KINDS as readonly string[]).includes(raw)) {
    throw new BadRequestException(`"kind" must be one of: ${REQUIRED_DOSSIER_KINDS.join(", ")}`);
  }
  return raw as DossierDocumentKind;
};
