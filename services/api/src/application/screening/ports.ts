import type { ScreeningResult } from "../../domain/screening/screening-result.js";

// 4.2: the seam a real sanctions/PEP provider plugs into. Deliberately narrow —
// a name and a date of birth in, a result out — so swapping providers is an
// adapter change and nothing else.
//
// WHICH provider is not decided here. That is an owner decision of the same
// kind as OD-7 (email): until it is made, the only adapter is a labeled mock,
// and the label travels with every result it produces.
export interface SanctionsScreening {
  screen(subject: {
    subjectId: string;
    fullName: string;
    dateOfBirth?: string;
  }): Promise<ScreeningResult>;
}

export interface ScreeningRepository {
  save(result: ScreeningResult): Promise<void>;
  findForSubject(subjectId: string): Promise<ScreeningResult[]>;
}
