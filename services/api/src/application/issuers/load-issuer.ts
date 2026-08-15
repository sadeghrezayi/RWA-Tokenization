import type { IssuerOrganisation } from "../../domain/issuers/issuer-organisation.js";
import { IssuerOrganisationNotFoundError } from "./errors.js";
import type { IssuerRepository } from "./ports.js";

export const loadIssuer = async (
  issuers: IssuerRepository,
  organisationId: string,
): Promise<IssuerOrganisation> => {
  const organisation = await issuers.findById(organisationId);
  if (!organisation) {
    throw new IssuerOrganisationNotFoundError(organisationId);
  }
  return organisation;
};
