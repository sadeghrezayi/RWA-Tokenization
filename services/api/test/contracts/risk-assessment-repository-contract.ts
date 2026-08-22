import { beforeEach, describe, expect, it } from "vitest";
import { RiskAssessment } from "../../src/domain/risk/risk-rating.js";
import type { RiskAssessmentRepository } from "../../src/application/risk/ports.js";

const ASSESSED_AT = new Date("2026-08-22T10:00:00.000Z");

const assessment = (subjectId: string, over: Partial<Parameters<typeof RiskAssessment.of>[0]> = {}) =>
  RiskAssessment.of({
    subjectId,
    answers: [
      { factorId: "geography", answer: "domestic", points: 0 },
      { factorId: "source_of_funds", answer: "business", points: 1 },
    ],
    thresholds: { medium: 3, high: 6 },
    assessedBy: "officer-1",
    assessedAt: ASSESSED_AT,
    ...over,
  });

// LSP contract: every RiskAssessmentRepository must pass this unchanged. The
// field most likely to be quietly dropped here is `answers` — the reasoning —
// leaving a bare band nobody can defend or review.
export const riskAssessmentRepositoryContract = (
  name: string,
  makeRepo: () => Promise<RiskAssessmentRepository>,
  seedSubject: (id: string) => Promise<void> = () => Promise.resolve(),
): void => {
  describe(`RiskAssessmentRepository contract — ${name}`, () => {
    let repo: RiskAssessmentRepository;

    beforeEach(async () => {
      repo = await makeRepo();
    });

    it("returns nothing for a subject never assessed", async () => {
      expect(await repo.findForSubject("nobody")).toEqual([]);
    });

    it("keeps the REASONING, not just the band", async () => {
      await seedSubject("subject-1");
      await repo.save(assessment("subject-1"));

      const [found] = await repo.findForSubject("subject-1");
      expect(found?.score).toBe(1);
      expect(found?.band).toBe("low");
      expect(found?.assessedBy).toBe("officer-1");
      expect(found?.assessedAt.toISOString()).toBe(ASSESSED_AT.toISOString());
      // Without these, nobody can review WHY the file was rated as it was.
      expect(found?.answers).toHaveLength(2);
      expect(found?.answers.find((a) => a.factorId === "source_of_funds")?.answer).toBe("business");
      expect(found?.answers.find((a) => a.factorId === "source_of_funds")?.points).toBe(1);
    });

    it("keeps a high rating high on the way back out", async () => {
      await seedSubject("subject-2");
      await repo.save(
        assessment("subject-2", {
          answers: [{ factorId: "exposure", answer: "pep", points: 7 }],
        }),
      );

      const [found] = await repo.findForSubject("subject-2");
      expect(found?.band).toBe("high");
      expect(found?.score).toBe(7);
    });

    it("appends rather than replaces, so a re-rating does not erase the last one", async () => {
      await seedSubject("subject-3");
      await repo.save(assessment("subject-3"));
      await repo.save(assessment("subject-3", { assessedBy: "officer-2" }));

      const found = await repo.findForSubject("subject-3");
      expect(found).toHaveLength(2);
      expect(found.map((a) => a.assessedBy).sort()).toEqual(["officer-1", "officer-2"]);
    });

    it("keeps one subject's assessments out of another's", async () => {
      await seedSubject("subject-4");
      await seedSubject("subject-5");
      await repo.save(assessment("subject-4"));

      expect(await repo.findForSubject("subject-5")).toEqual([]);
    });
  });
};
