import { describe, expect, it } from "vitest";
import {
  AddCrmNote,
  AddInvestorTag,
  CompleteFollowUp,
  CreateFollowUp,
  ListOpenFollowUps,
  RemoveInvestorTag,
  SetRelationshipStage,
} from "../../../src/application/crm/crm-use-cases.js";
import { FollowUpNotFoundError } from "../../../src/application/crm/errors.js";
import { InvestorNotFoundError } from "../../../src/application/identity/errors.js";
import { InvalidNoteError } from "../../../src/domain/crm/errors.js";
import { EmailAddress } from "../../../src/domain/identity/email-address.js";
import { Investor } from "../../../src/domain/identity/investor.js";
import { KycStatus } from "../../../src/domain/identity/kyc-status.js";
import { PasswordHash } from "../../../src/domain/identity/password-hash.js";
import { InMemoryInvestorRepository, SequentialIdGenerator } from "../../fakes/identity-fakes.js";
import { FixedClock } from "../../fakes/offering-fakes.js";
import {
  InMemoryCrmNoteRepository,
  InMemoryCrmProfileRepository,
  InMemoryFollowUpRepository,
} from "../../fakes/crm-fakes.js";

const NOW = new Date("2026-07-20T12:00:00Z");
const PAST_DUE = new Date("2026-07-19T00:00:00Z");
const FUTURE_DUE = new Date("2026-07-30T00:00:00Z");

const setup = async () => {
  const investors = new InMemoryInvestorRepository();
  await investors.save(
    Investor.restore(
      "sara",
      EmailAddress.of("sara@demo.com"),
      PasswordHash.of("hashed:pw"),
      KycStatus.restore("approved"),
    ),
  );
  const profiles = new InMemoryCrmProfileRepository();
  const notes = new InMemoryCrmNoteRepository();
  const followUps = new InMemoryFollowUpRepository();
  const clock = new FixedClock(NOW);
  const ids = new SequentialIdGenerator();
  return {
    profiles,
    notes,
    followUps,
    clock,
    setStage: new SetRelationshipStage(profiles, investors),
    addTag: new AddInvestorTag(profiles, investors),
    removeTag: new RemoveInvestorTag(profiles, investors),
    addNote: new AddCrmNote(notes, investors, ids, clock),
    createFollowUp: new CreateFollowUp(followUps, investors, ids, clock),
    completeFollowUp: new CompleteFollowUp(followUps, clock),
    listOpen: new ListOpenFollowUps(followUps, investors, clock),
  };
};

describe("SetRelationshipStage + tags (CRM profile)", () => {
  it("creates_the_profile_on_first_stage_change_then_updates_it", async () => {
    const s = await setup();

    await s.setStage.execute({ investorId: "sara", stage: "contacted" });
    expect((await s.profiles.findByInvestor("sara"))?.stage).toBe("contacted");

    await s.setStage.execute({ investorId: "sara", stage: "active" });
    expect((await s.profiles.findByInvestor("sara"))?.stage).toBe("active");
  });

  it("adds_and_removes_tags_preserving_the_stage", async () => {
    const s = await setup();
    await s.setStage.execute({ investorId: "sara", stage: "active" });

    await s.addTag.execute({ investorId: "sara", tag: "qualified" });
    await s.addTag.execute({ investorId: "sara", tag: "referred" });
    await s.removeTag.execute({ investorId: "sara", tag: "referred" });

    const profile = await s.profiles.findByInvestor("sara");
    expect(profile?.tags).toEqual(["qualified"]);
    expect(profile?.stage).toBe("active");
  });

  it("rejects_an_unknown_investor", async () => {
    const s = await setup();
    await expect(s.setStage.execute({ investorId: "ghost", stage: "lead" })).rejects.toThrow(
      InvestorNotFoundError,
    );
    await expect(s.addTag.execute({ investorId: "ghost", tag: "x" })).rejects.toThrow(
      InvestorNotFoundError,
    );
  });
});

describe("AddCrmNote", () => {
  it("persists_the_trimmed_note_with_author_and_time", async () => {
    const s = await setup();

    const { noteId } = await s.addNote.execute({
      investorId: "sara",
      authorId: "officer-1",
      text: "  Interested in the next offering.  ",
    });

    const list = await s.notes.listByInvestor("sara");
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      id: noteId,
      authorId: "officer-1",
      text: "Interested in the next offering.",
      at: NOW,
    });
  });

  it("propagates_blank_note_rejection_and_unknown_investor", async () => {
    const s = await setup();
    await expect(
      s.addNote.execute({ investorId: "sara", authorId: "o", text: "  " }),
    ).rejects.toThrow(InvalidNoteError);
    await expect(
      s.addNote.execute({ investorId: "ghost", authorId: "o", text: "hi" }),
    ).rejects.toThrow(InvestorNotFoundError);
  });
});

describe("Follow-ups", () => {
  it("creates_then_completes_a_follow_up", async () => {
    const s = await setup();

    const { followUpId } = await s.createFollowUp.execute({
      investorId: "sara",
      text: "Send valuation report",
      dueAt: FUTURE_DUE,
    });
    expect((await s.followUps.findById(followUpId))?.state).toBe("open");

    await s.completeFollowUp.execute({ followUpId });
    const done = await s.followUps.findById(followUpId);
    expect(done?.state).toBe("done");
    expect(done?.doneAt).toEqual(NOW);
  });

  it("rejects_completing_an_unknown_follow_up", async () => {
    const s = await setup();
    await expect(s.completeFollowUp.execute({ followUpId: "ghost" })).rejects.toThrow(
      FollowUpNotFoundError,
    );
  });

  it("lists_open_follow_ups_due_soonest_first_with_emails_and_overdue_flags", async () => {
    const s = await setup();
    const overdue = await s.createFollowUp.execute({
      investorId: "sara",
      text: "Chase KYC documents",
      dueAt: PAST_DUE,
    });
    await s.createFollowUp.execute({
      investorId: "sara",
      text: "Send valuation report",
      dueAt: FUTURE_DUE,
    });
    const completed = await s.createFollowUp.execute({
      investorId: "sara",
      text: "Already handled",
      dueAt: PAST_DUE,
    });
    await s.completeFollowUp.execute({ followUpId: completed.followUpId });

    const list = await s.listOpen.execute();

    expect(list).toEqual([
      {
        id: overdue.followUpId,
        investorId: "sara",
        email: "sara@demo.com",
        text: "Chase KYC documents",
        dueAt: PAST_DUE.toISOString(),
        overdue: true,
      },
      expect.objectContaining({ text: "Send valuation report", overdue: false }),
    ]);
  });
});
