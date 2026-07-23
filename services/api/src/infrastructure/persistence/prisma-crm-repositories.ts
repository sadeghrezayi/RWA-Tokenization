import type { PrismaClient, CrmFollowUp as FollowUpRow } from "@prisma/client";
import { CrmProfile } from "../../domain/crm/crm-profile.js";
import { CrmNote } from "../../domain/crm/crm-note.js";
import { FollowUp } from "../../domain/crm/follow-up.js";
import type { FollowUpState } from "../../domain/crm/follow-up.js";
import type {
  CrmNoteRepository,
  CrmProfileRepository,
  FollowUpRepository,
} from "../../application/crm/ports.js";

export class PrismaCrmProfileRepository implements CrmProfileRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByInvestor(investorId: string): Promise<CrmProfile | undefined> {
    const row = await this.prisma.crmProfile.findFirst({ where: { investorId } });
    return row
      ? CrmProfile.restore({ investorId: row.investorId, stage: row.stage, tags: row.tags })
      : undefined;
  }

  async save(profile: CrmProfile): Promise<void> {
    const data = { stage: profile.stage, tags: [...profile.tags] };
    // Tenant-safe pattern (no upsert): probe, then create or updateMany.
    const updated = await this.prisma.crmProfile.updateMany({
      where: { investorId: profile.investorId },
      data,
    });
    if (updated.count === 0) {
      await this.prisma.crmProfile.create({
        data: { investorId: profile.investorId, ...data },
      });
    }
  }
}

export class PrismaCrmNoteRepository implements CrmNoteRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listByInvestor(investorId: string): Promise<CrmNote[]> {
    const rows = await this.prisma.crmNote.findMany({
      where: { investorId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    return rows.map((row) =>
      CrmNote.write({
        id: row.id,
        investorId: row.investorId,
        authorId: row.authorId,
        text: row.text,
        at: row.createdAt,
      }),
    );
  }

  async save(note: CrmNote): Promise<void> {
    await this.prisma.crmNote.create({
      data: {
        id: note.id,
        investorId: note.investorId,
        authorId: note.authorId,
        text: note.text,
        createdAt: note.at,
      },
    });
  }
}

export class PrismaFollowUpRepository implements FollowUpRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<FollowUp | undefined> {
    const row = await this.prisma.crmFollowUp.findFirst({ where: { id } });
    return row ? toFollowUp(row) : undefined;
  }

  async listByInvestor(investorId: string): Promise<FollowUp[]> {
    const rows = await this.prisma.crmFollowUp.findMany({
      where: { investorId },
      orderBy: { dueAt: "asc" },
    });
    return rows.map(toFollowUp);
  }

  async listOpen(): Promise<FollowUp[]> {
    const rows = await this.prisma.crmFollowUp.findMany({
      where: { state: "open" },
      orderBy: { dueAt: "asc" },
    });
    return rows.map(toFollowUp);
  }

  async save(followUp: FollowUp): Promise<void> {
    const data = {
      investorId: followUp.investorId,
      text: followUp.text,
      dueAt: followUp.dueAt,
      state: followUp.state,
      doneAt: followUp.doneAt ?? null,
      createdAt: followUp.createdAt,
    };
    // Tenant-safe pattern (no upsert): try update first, create when absent.
    const updated = await this.prisma.crmFollowUp.updateMany({
      where: { id: followUp.id },
      data,
    });
    if (updated.count === 0) {
      await this.prisma.crmFollowUp.create({ data: { id: followUp.id, ...data } });
    }
  }
}

const toFollowUp = (row: FollowUpRow): FollowUp =>
  FollowUp.restore({
    id: row.id,
    investorId: row.investorId,
    text: row.text,
    dueAt: row.dueAt,
    createdAt: row.createdAt,
    state: row.state as FollowUpState,
    doneAt: row.doneAt ?? undefined,
  });
