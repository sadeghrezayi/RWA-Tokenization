// FR-AO-4: structured onboarding checklist gating operator approval.
export const CHECKLIST_ITEMS = [
  "legal_right_clear",
  "transferable",
  "custodian_engaged",
  "valuation_current",
] as const;

export type ChecklistItem = (typeof CHECKLIST_ITEMS)[number];

export class OnboardingChecklist {
  private constructor(private readonly confirmed: ReadonlySet<ChecklistItem>) {}

  static empty(): OnboardingChecklist {
    return new OnboardingChecklist(new Set());
  }

  static restore(confirmed: readonly ChecklistItem[]): OnboardingChecklist {
    return new OnboardingChecklist(new Set(confirmed));
  }

  confirm(item: ChecklistItem): OnboardingChecklist {
    return new OnboardingChecklist(new Set([...this.confirmed, item]));
  }

  isConfirmed(item: ChecklistItem): boolean {
    return this.confirmed.has(item);
  }

  allConfirmed(): boolean {
    return this.unconfirmedItems().length === 0;
  }

  unconfirmedItems(): ChecklistItem[] {
    return CHECKLIST_ITEMS.filter((item) => !this.confirmed.has(item));
  }

  confirmedItems(): ChecklistItem[] {
    return CHECKLIST_ITEMS.filter((item) => this.confirmed.has(item));
  }
}
