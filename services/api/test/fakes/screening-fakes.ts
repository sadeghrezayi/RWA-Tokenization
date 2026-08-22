import type { ScreeningResult } from "../../src/domain/screening/screening-result.js";
import type { ScreeningRepository } from "../../src/application/screening/ports.js";

export class InMemoryScreeningRepository implements ScreeningRepository {
  readonly all: ScreeningResult[] = [];

  save(result: ScreeningResult): Promise<void> {
    this.all.push(result);
    return Promise.resolve();
  }

  findForSubject(subjectId: string): Promise<ScreeningResult[]> {
    return Promise.resolve(this.all.filter((r) => r.subjectId === subjectId));
  }
}
