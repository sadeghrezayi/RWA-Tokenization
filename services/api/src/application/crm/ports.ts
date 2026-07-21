import type { CrmProfile } from "../../domain/crm/crm-profile.js";
import type { CrmNote } from "../../domain/crm/crm-note.js";
import type { FollowUp } from "../../domain/crm/follow-up.js";

export interface CrmProfileRepository {
  findByInvestor(investorId: string): Promise<CrmProfile | undefined>;
  save(profile: CrmProfile): Promise<void>;
}

// Notes come back newest first.
export interface CrmNoteRepository {
  listByInvestor(investorId: string): Promise<CrmNote[]>;
  save(note: CrmNote): Promise<void>;
}

// Follow-ups come back due-soonest first; listOpen serves the officer queue.
export interface FollowUpRepository {
  findById(id: string): Promise<FollowUp | undefined>;
  listByInvestor(investorId: string): Promise<FollowUp[]>;
  listOpen(): Promise<FollowUp[]>;
  save(followUp: FollowUp): Promise<void>;
}
