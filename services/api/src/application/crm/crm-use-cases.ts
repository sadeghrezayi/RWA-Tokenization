import { CrmProfile } from "../../domain/crm/crm-profile.js";
import type { RelationshipStage } from "../../domain/crm/crm-profile.js";
import { CrmNote } from "../../domain/crm/crm-note.js";
import { FollowUp } from "../../domain/crm/follow-up.js";
import { loadInvestor } from "../identity/load-investor.js";
import type { IdGenerator, InvestorRepository } from "../identity/ports.js";
import type { Clock } from "../offerings/ports.js";
import { FollowUpNotFoundError } from "./errors.js";
import type { CrmNoteRepository, CrmProfileRepository, FollowUpRepository } from "./ports.js";

// CRM write side (user-approved scope 2026-07-20): every action verifies the
// investor exists; domain rules (stage enum, tag/note/follow-up validity)
// enforce themselves. Off-chain operational data — no audit-log rows yet
// (identity-scoped audit is a named open gap).
const profileOf = async (profiles: CrmProfileRepository, investorId: string): Promise<CrmProfile> =>
  (await profiles.findByInvestor(investorId)) ?? CrmProfile.initial(investorId);

export class SetRelationshipStage {
  constructor(
    private readonly profiles: CrmProfileRepository,
    private readonly investors: InvestorRepository,
  ) {}

  async execute(input: { investorId: string; stage: RelationshipStage }): Promise<void> {
    const investor = await loadInvestor(this.investors, input.investorId);
    await this.profiles.save((await profileOf(this.profiles, investor.id)).withStage(input.stage));
  }
}

export class AddInvestorTag {
  constructor(
    private readonly profiles: CrmProfileRepository,
    private readonly investors: InvestorRepository,
  ) {}

  async execute(input: { investorId: string; tag: string }): Promise<void> {
    const investor = await loadInvestor(this.investors, input.investorId);
    await this.profiles.save((await profileOf(this.profiles, investor.id)).addTag(input.tag));
  }
}

export class RemoveInvestorTag {
  constructor(
    private readonly profiles: CrmProfileRepository,
    private readonly investors: InvestorRepository,
  ) {}

  async execute(input: { investorId: string; tag: string }): Promise<void> {
    const investor = await loadInvestor(this.investors, input.investorId);
    await this.profiles.save((await profileOf(this.profiles, investor.id)).removeTag(input.tag));
  }
}

export class AddCrmNote {
  constructor(
    private readonly notes: CrmNoteRepository,
    private readonly investors: InvestorRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(input: {
    investorId: string;
    authorId: string;
    text: string;
  }): Promise<{ noteId: string }> {
    const investor = await loadInvestor(this.investors, input.investorId);
    const note = CrmNote.write({
      id: this.ids.nextId(),
      investorId: investor.id,
      authorId: input.authorId,
      text: input.text,
      at: this.clock.now(),
    });
    await this.notes.save(note);
    return { noteId: note.id };
  }
}

export class CreateFollowUp {
  constructor(
    private readonly followUps: FollowUpRepository,
    private readonly investors: InvestorRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(input: {
    investorId: string;
    text: string;
    dueAt: Date;
  }): Promise<{ followUpId: string }> {
    const investor = await loadInvestor(this.investors, input.investorId);
    const followUp = FollowUp.create({
      id: this.ids.nextId(),
      investorId: investor.id,
      text: input.text,
      dueAt: input.dueAt,
      createdAt: this.clock.now(),
    });
    await this.followUps.save(followUp);
    return { followUpId: followUp.id };
  }
}

export class CompleteFollowUp {
  constructor(
    private readonly followUps: FollowUpRepository,
    private readonly clock: Clock,
  ) {}

  async execute(input: { followUpId: string }): Promise<void> {
    const followUp = await this.followUps.findById(input.followUpId);
    if (!followUp) {
      throw new FollowUpNotFoundError(input.followUpId);
    }
    await this.followUps.save(followUp.complete(this.clock.now()));
  }
}

export interface OpenFollowUpView {
  id: string;
  investorId: string;
  email: string;
  text: string;
  dueAt: string;
  overdue: boolean;
}

export class ListOpenFollowUps {
  constructor(
    private readonly followUps: FollowUpRepository,
    private readonly investors: InvestorRepository,
    private readonly clock: Clock,
  ) {}

  async execute(): Promise<OpenFollowUpView[]> {
    const now = this.clock.now();
    const open = await this.followUps.listOpen();
    const emails = new Map<string, string>();
    const views: OpenFollowUpView[] = [];
    for (const followUp of open) {
      let email = emails.get(followUp.investorId);
      if (email === undefined) {
        email =
          (await this.investors.findById(followUp.investorId))?.email.value ?? followUp.investorId;
        emails.set(followUp.investorId, email);
      }
      views.push({
        id: followUp.id,
        investorId: followUp.investorId,
        email,
        text: followUp.text,
        dueAt: followUp.dueAt.toISOString(),
        overdue: followUp.isOverdue(now),
      });
    }
    return views;
  }
}
