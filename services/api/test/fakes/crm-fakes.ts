import type { CrmProfile } from "../../src/domain/crm/crm-profile.js";
import type { CrmNote } from "../../src/domain/crm/crm-note.js";
import type { FollowUp } from "../../src/domain/crm/follow-up.js";
import type {
  CrmNoteRepository,
  CrmProfileRepository,
  FollowUpRepository,
} from "../../src/application/crm/ports.js";

export class InMemoryCrmProfileRepository implements CrmProfileRepository {
  private readonly byInvestor = new Map<string, CrmProfile>();

  findByInvestor(investorId: string): Promise<CrmProfile | undefined> {
    return Promise.resolve(this.byInvestor.get(investorId));
  }

  save(profile: CrmProfile): Promise<void> {
    this.byInvestor.set(profile.investorId, profile);
    return Promise.resolve();
  }
}

export class InMemoryCrmNoteRepository implements CrmNoteRepository {
  private readonly notes: CrmNote[] = [];

  listByInvestor(investorId: string): Promise<CrmNote[]> {
    return Promise.resolve(
      this.notes
        .filter((note) => note.investorId === investorId)
        .sort((a, b) => b.at.getTime() - a.at.getTime()),
    );
  }

  save(note: CrmNote): Promise<void> {
    this.notes.push(note);
    return Promise.resolve();
  }
}

export class InMemoryFollowUpRepository implements FollowUpRepository {
  private readonly byId = new Map<string, FollowUp>();

  findById(id: string): Promise<FollowUp | undefined> {
    return Promise.resolve(this.byId.get(id));
  }

  listByInvestor(investorId: string): Promise<FollowUp[]> {
    return Promise.resolve(
      [...this.byId.values()]
        .filter((f) => f.investorId === investorId)
        .sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime()),
    );
  }

  listOpen(): Promise<FollowUp[]> {
    return Promise.resolve(
      [...this.byId.values()]
        .filter((f) => f.state === "open")
        .sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime()),
    );
  }

  save(followUp: FollowUp): Promise<void> {
    this.byId.set(followUp.id, followUp);
    return Promise.resolve();
  }
}
