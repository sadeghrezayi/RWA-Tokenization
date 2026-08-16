import type { IssuerMembership } from "../../domain/issuers/issuer-membership.js";
import type { IssuerOrganisation } from "../../domain/issuers/issuer-organisation.js";

export interface IssuerRepository {
  findById(id: string): Promise<IssuerOrganisation | undefined>;
  findAll(): Promise<IssuerOrganisation[]>;
  save(organisation: IssuerOrganisation): Promise<void>;

  // Membership is stored with the organisation but read on its own: the common
  // question at request time is "which organisation is this user acting for?"
  addMember(membership: IssuerMembership): Promise<void>;
  removeMember(organisationId: string, userId: string): Promise<void>;
  membersOf(organisationId: string): Promise<IssuerMembership[]>;
  membershipsFor(userId: string): Promise<IssuerMembership[]>;
}

// Answers "has this person completed individual verification?".
//
// A port rather than a direct lookup because an issuer's people are Users while
// individual KYC currently lives on the Investor record — the adapter has real
// work behind it, and these use cases must not care how it is resolved.
export interface PersonVerification {
  isVerified(userId: string): Promise<boolean>;
}

// Who a person is, for the two directions an issuer team needs: inviting a
// colleague (address → person) and reading a team back (person → address).
// Deliberately separate from the verification gate above — widening a lookup
// must never be able to widen the gate.
export interface PersonDirectory {
  // Matches the normalized address, so an invitation works however the sender
  // capitalized or padded what they typed.
  findIdByEmail(email: string): Promise<string | undefined>;
  emailOf(userId: string): Promise<string | undefined>;
}
