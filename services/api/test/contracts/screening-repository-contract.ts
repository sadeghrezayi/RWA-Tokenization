import { beforeEach, describe, expect, it } from "vitest";
import { ScreeningResult } from "../../src/domain/screening/screening-result.js";
import type { ScreeningRepository } from "../../src/application/screening/ports.js";

const CHECKED_AT = new Date("2026-08-22T10:00:00.000Z");

const result = (subjectId: string, over: Partial<Parameters<typeof ScreeningResult.of>[0]> = {}) =>
  ScreeningResult.of({
    subjectId,
    outcome: "clear",
    provider: "mock",
    simulated: true,
    checkedAt: CHECKED_AT,
    ...over,
  });

// LSP contract: every ScreeningRepository must pass this unchanged. It exists
// because this project has three times shipped a Prisma adapter that silently
// dropped a field the in-memory one kept — and for a screening, the field most
// likely to be dropped is the one that says the result was simulated.
export const screeningRepositoryContract = (
  name: string,
  makeRepo: (seedSubject: (id: string) => Promise<void>) => Promise<ScreeningRepository>,
  seedSubject: (id: string) => Promise<void> = () => Promise.resolve(),
): void => {
  describe(`ScreeningRepository contract — ${name}`, () => {
    let repo: ScreeningRepository;

    beforeEach(async () => {
      repo = await makeRepo(seedSubject);
    });

    it("returns nothing for a subject never screened", async () => {
      expect(await repo.findForSubject("nobody")).toEqual([]);
    });

    it("keeps every field, including the ones that say what produced it", async () => {
      await seedSubject("subject-1");
      await repo.save(result("subject-1", { outcome: "possible_match" }));

      const [found] = await repo.findForSubject("subject-1");
      expect(found?.subjectId).toBe("subject-1");
      expect(found?.outcome).toBe("possible_match");
      expect(found?.provider).toBe("mock");
      // The one that matters: a stored result must still know it was simulated.
      expect(found?.simulated).toBe(true);
      expect(found?.checkedAt.toISOString()).toBe(CHECKED_AT.toISOString());
      expect(found?.disclaimer()).toBeTruthy();
    });

    it("keeps a real result distinguishable from a simulated one", async () => {
      await seedSubject("subject-2");
      await repo.save(result("subject-2", { provider: "acme-sanctions", simulated: false }));

      const [found] = await repo.findForSubject("subject-2");
      expect(found?.simulated).toBe(false);
      expect(found?.disclaimer()).toBeUndefined();
    });

    it("appends rather than replaces, so the history survives", async () => {
      await seedSubject("subject-3");
      await repo.save(result("subject-3"));
      await repo.save(result("subject-3", { outcome: "possible_match" }));

      expect(await repo.findForSubject("subject-3")).toHaveLength(2);
    });

    it("keeps one subject's screenings out of another's", async () => {
      await seedSubject("subject-4");
      await seedSubject("subject-5");
      await repo.save(result("subject-4"));

      expect(await repo.findForSubject("subject-5")).toEqual([]);
    });
  });
};
