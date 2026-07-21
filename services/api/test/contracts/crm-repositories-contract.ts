import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { CrmProfile } from "../../src/domain/crm/crm-profile.js";
import { CrmNote } from "../../src/domain/crm/crm-note.js";
import { FollowUp } from "../../src/domain/crm/follow-up.js";
import type {
  CrmNoteRepository,
  CrmProfileRepository,
  FollowUpRepository,
} from "../../src/application/crm/ports.js";

const T1 = new Date("2026-07-10T00:00:00.000Z");
const T2 = new Date("2026-07-15T00:00:00.000Z");
const T3 = new Date("2026-07-18T00:00:00.000Z");

// LSP contracts for the CRM stores. Investor ids are randomized so the suites
// are safe against a shared database.
export const crmProfileRepositoryContract = (
  name: string,
  makeRepo: () => Promise<CrmProfileRepository>,
): void => {
  describe(`CrmProfileRepository contract — ${name}`, () => {
    let repo: CrmProfileRepository;
    let investor: string;

    beforeEach(async () => {
      repo = await makeRepo();
      investor = `crm-${randomUUID()}`;
    });

    it("returns_undefined_for_an_unknown_investor", async () => {
      expect(await repo.findByInvestor(investor)).toBeUndefined();
    });

    it("round_trips_stage_and_tags_and_overwrites_on_save", async () => {
      await repo.save(CrmProfile.initial(investor).withStage("contacted").addTag("Qualified"));
      await repo.save(
        CrmProfile.restore({ investorId: investor, stage: "active", tags: ["Qualified", "vip"] }),
      );

      const found = await repo.findByInvestor(investor);
      expect(found?.stage).toBe("active");
      expect(found?.tags).toEqual(["Qualified", "vip"]);
    });
  });
};

export const crmNoteRepositoryContract = (
  name: string,
  makeRepo: () => Promise<CrmNoteRepository>,
): void => {
  describe(`CrmNoteRepository contract — ${name}`, () => {
    let repo: CrmNoteRepository;
    let investor: string;

    beforeEach(async () => {
      repo = await makeRepo();
      investor = `crm-${randomUUID()}`;
    });

    it("lists_an_investors_notes_newest_first_only", async () => {
      const note = (id: string, at: Date, investorId = investor) =>
        CrmNote.write({ id, investorId, authorId: "officer-1", text: `note ${id}`, at });
      await repo.save(note(`${investor}-a`, T1));
      await repo.save(note(`${investor}-b`, T3));
      await repo.save(note(`${investor}-c`, T2));
      await repo.save(note(`${investor}-other`, T3, `${investor}-else`));

      const list = await repo.listByInvestor(investor);

      expect(list.map((n) => n.id)).toEqual([
        `${investor}-b`,
        `${investor}-c`,
        `${investor}-a`,
      ]);
      expect(list[0]?.at).toEqual(T3);
      expect(list[0]?.authorId).toBe("officer-1");
    });
  });
};

export const followUpRepositoryContract = (
  name: string,
  makeRepo: () => Promise<FollowUpRepository>,
): void => {
  describe(`FollowUpRepository contract — ${name}`, () => {
    let repo: FollowUpRepository;
    let investor: string;

    beforeEach(async () => {
      repo = await makeRepo();
      investor = `crm-${randomUUID()}`;
    });

    const followUp = (id: string, dueAt: Date) =>
      FollowUp.create({ id, investorId: investor, text: `do ${id}`, dueAt, createdAt: T1 });

    it("round_trips_and_lists_by_investor_due_soonest_first", async () => {
      await repo.save(followUp(`${investor}-late`, T3));
      await repo.save(followUp(`${investor}-soon`, T2));

      const list = await repo.listByInvestor(investor);
      expect(list.map((f) => f.id)).toEqual([`${investor}-soon`, `${investor}-late`]);
      expect(list[0]?.state).toBe("open");
      expect(list[0]?.createdAt).toEqual(T1);
    });

    it("save_persists_completion_and_listOpen_excludes_done", async () => {
      const f = followUp(`${investor}-x`, T2);
      await repo.save(f);
      await repo.save(f.complete(T3));

      const stored = await repo.findById(`${investor}-x`);
      expect(stored?.state).toBe("done");
      expect(stored?.doneAt).toEqual(T3);

      const open = await repo.listOpen();
      expect(open.some((o) => o.id === `${investor}-x`)).toBe(false);
    });

    it("listOpen_serves_open_items_from_any_investor", async () => {
      await repo.save(followUp(`${investor}-open`, T2));
      const open = await repo.listOpen();
      expect(open.some((o) => o.id === `${investor}-open`)).toBe(true);
      expect(await repo.findById("missing")).toBeUndefined();
    });
  });
};
