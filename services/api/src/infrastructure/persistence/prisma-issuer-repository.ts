import type {
  IssuerMembership as MembershipRow,
  IssuerOrganisation as OrganisationRow,
  PrismaClient,
} from "@prisma/client";
import { IssuerMembership } from "../../domain/issuers/issuer-membership.js";
import type { IssuerRole } from "../../domain/issuers/issuer-membership.js";
import { IssuerOrganisation } from "../../domain/issuers/issuer-organisation.js";
import type { IssuerOrganisationState } from "../../domain/issuers/issuer-organisation.js";
import type { IssuerRepository } from "../../application/issuers/ports.js";

// 3.2 persistence. Tenant-safe patterns throughout (probe then create/
// updateMany, never upsert) — the scoped client forbids the by-id operations.
export class PrismaIssuerRepository implements IssuerRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<IssuerOrganisation | undefined> {
    const row = await this.prisma.issuerOrganisation.findFirst({ where: { id } });
    return row ? toDomain(row) : undefined;
  }

  async findAll(): Promise<IssuerOrganisation[]> {
    const rows = await this.prisma.issuerOrganisation.findMany({ orderBy: { appliedAt: "desc" } });
    return rows.map(toDomain);
  }

  async save(organisation: IssuerOrganisation): Promise<void> {
    const data = {
      legalName: organisation.legalName,
      registrationNumber: organisation.registrationNumber,
      contactEmail: organisation.contactEmail,
      state: organisation.state,
      appliedAt: organisation.appliedAt,
      decidedAt: organisation.decidedAt ?? null,
      decidedBy: organisation.decidedBy ?? null,
      rejectionReason: organisation.rejectionReason ?? null,
    };
    const exists = await this.prisma.issuerOrganisation.findFirst({
      where: { id: organisation.id },
    });
    if (exists) {
      await this.prisma.issuerOrganisation.updateMany({ where: { id: organisation.id }, data });
      return;
    }
    await this.prisma.issuerOrganisation.create({ data: { id: organisation.id, ...data } });
  }

  async addMember(membership: IssuerMembership): Promise<void> {
    // One row per person per organisation: adding again changes the role.
    const existing = await this.prisma.issuerMembership.findFirst({
      where: { organisationId: membership.organisationId, userId: membership.userId },
    });
    if (existing) {
      await this.prisma.issuerMembership.updateMany({
        where: { organisationId: membership.organisationId, userId: membership.userId },
        data: { role: membership.role, addedAt: membership.addedAt },
      });
      return;
    }
    await this.prisma.issuerMembership.create({
      data: {
        organisationId: membership.organisationId,
        userId: membership.userId,
        role: membership.role,
        addedAt: membership.addedAt,
      },
    });
  }

  async removeMember(organisationId: string, userId: string): Promise<void> {
    await this.prisma.issuerMembership.deleteMany({ where: { organisationId, userId } });
  }

  async membersOf(organisationId: string): Promise<IssuerMembership[]> {
    const rows = await this.prisma.issuerMembership.findMany({ where: { organisationId } });
    return rows.map(toMembership);
  }

  async membershipsFor(userId: string): Promise<IssuerMembership[]> {
    const rows = await this.prisma.issuerMembership.findMany({ where: { userId } });
    return rows.map(toMembership);
  }
}

const toDomain = (row: OrganisationRow): IssuerOrganisation =>
  IssuerOrganisation.restore({
    id: row.id,
    legalName: row.legalName,
    registrationNumber: row.registrationNumber,
    contactEmail: row.contactEmail,
    state: row.state as IssuerOrganisationState,
    appliedAt: row.appliedAt,
    ...(row.decidedAt !== null ? { decidedAt: row.decidedAt } : {}),
    ...(row.decidedBy !== null ? { decidedBy: row.decidedBy } : {}),
    ...(row.rejectionReason !== null ? { rejectionReason: row.rejectionReason } : {}),
  });

const toMembership = (row: MembershipRow): IssuerMembership =>
  IssuerMembership.of({
    organisationId: row.organisationId,
    userId: row.userId,
    role: row.role as IssuerRole,
    addedAt: row.addedAt,
  });
