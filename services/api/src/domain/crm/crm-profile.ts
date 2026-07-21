import { InvalidStageError, InvalidTagError } from "./errors.js";

// CRM (user-approved scope 2026-07-20, beyond PRD): the officer-maintained
// relationship state for one investor. Off-chain operational data only.
export const RELATIONSHIP_STAGES = [
  "lead",
  "contacted",
  "onboarding",
  "active",
  "dormant",
] as const;
export type RelationshipStage = (typeof RELATIONSHIP_STAGES)[number];

const MAX_TAG_LENGTH = 40;

const assertStage = (stage: string): RelationshipStage => {
  if (!(RELATIONSHIP_STAGES as readonly string[]).includes(stage)) {
    throw new InvalidStageError(`"${stage}" is not a relationship stage`);
  }
  return stage as RelationshipStage;
};

export class CrmProfile {
  private constructor(
    public readonly investorId: string,
    public readonly stage: RelationshipStage,
    private readonly tagList: readonly string[],
  ) {}

  static initial(investorId: string): CrmProfile {
    return new CrmProfile(investorId, "lead", []);
  }

  static restore(fields: { investorId: string; stage: string; tags: string[] }): CrmProfile {
    return new CrmProfile(fields.investorId, assertStage(fields.stage), [...fields.tags]);
  }

  get tags(): readonly string[] {
    return [...this.tagList];
  }

  withStage(stage: RelationshipStage): CrmProfile {
    return new CrmProfile(this.investorId, assertStage(stage), this.tagList);
  }

  addTag(raw: string): CrmProfile {
    const tag = raw.trim();
    if (tag === "" || tag.length > MAX_TAG_LENGTH) {
      throw new InvalidTagError(`a tag must be 1-${String(MAX_TAG_LENGTH)} characters`);
    }
    if (this.tagList.some((existing) => existing.toLowerCase() === tag.toLowerCase())) {
      return this;
    }
    return new CrmProfile(this.investorId, this.stage, [...this.tagList, tag]);
  }

  removeTag(raw: string): CrmProfile {
    const needle = raw.trim().toLowerCase();
    return new CrmProfile(
      this.investorId,
      this.stage,
      this.tagList.filter((existing) => existing.toLowerCase() !== needle),
    );
  }
}
