import { describe, expect, it } from "vitest";
import { CrmProfile, RELATIONSHIP_STAGES } from "../../../src/domain/crm/crm-profile.js";
import { CrmNote } from "../../../src/domain/crm/crm-note.js";
import { FollowUp } from "../../../src/domain/crm/follow-up.js";
import {
  InvalidFollowUpError,
  InvalidFollowUpTransitionError,
  InvalidNoteError,
  InvalidStageError,
  InvalidTagError,
} from "../../../src/domain/crm/errors.js";

const NOW = new Date("2026-07-20T12:00:00Z");
const LATER = new Date("2026-07-25T12:00:00Z");

describe("CrmProfile (relationship stage + tags)", () => {
  it("starts_as_a_lead_with_no_tags", () => {
    const profile = CrmProfile.initial("sara");
    expect(profile.investorId).toBe("sara");
    expect(profile.stage).toBe("lead");
    expect(profile.tags).toEqual([]);
  });

  it("moves_between_valid_stages_immutably", () => {
    const profile = CrmProfile.initial("sara");
    const active = profile.withStage("active");
    expect(active.stage).toBe("active");
    expect(profile.stage).toBe("lead");
    expect(RELATIONSHIP_STAGES).toContain("dormant");
  });

  it("rejects_an_unknown_stage", () => {
    expect(() => CrmProfile.initial("sara").withStage("vip" as never)).toThrow(InvalidStageError);
    expect(() => CrmProfile.restore({ investorId: "sara", stage: "bogus", tags: [] })).toThrow(
      InvalidStageError,
    );
  });

  it("adds_trimmed_tags_and_dedupes_case_insensitively", () => {
    const profile = CrmProfile.initial("sara")
      .addTag("  Qualified ")
      .addTag("high-net-worth")
      .addTag("QUALIFIED");
    expect(profile.tags).toEqual(["Qualified", "high-net-worth"]);
  });

  it("rejects_blank_or_oversized_tags", () => {
    expect(() => CrmProfile.initial("sara").addTag("   ")).toThrow(InvalidTagError);
    expect(() => CrmProfile.initial("sara").addTag("x".repeat(41))).toThrow(InvalidTagError);
  });

  it("removes_tags_case_insensitively", () => {
    const profile = CrmProfile.initial("sara").addTag("Qualified").removeTag("qualified");
    expect(profile.tags).toEqual([]);
  });
});

describe("CrmNote", () => {
  it("keeps_the_trimmed_text_with_author_and_time", () => {
    const note = CrmNote.write({
      id: "n1",
      investorId: "sara",
      authorId: "officer-1",
      text: "  Called about the Vanak offering.  ",
      at: NOW,
    });
    expect(note.text).toBe("Called about the Vanak offering.");
    expect(note.authorId).toBe("officer-1");
  });

  it("rejects_a_blank_note", () => {
    expect(() =>
      CrmNote.write({ id: "n1", investorId: "sara", authorId: "o", text: "   ", at: NOW }),
    ).toThrow(InvalidNoteError);
  });
});

describe("FollowUp (reminders)", () => {
  const followUp = () =>
    FollowUp.create({
      id: "f1",
      investorId: "sara",
      text: "Send the Q3 valuation report",
      dueAt: LATER,
      createdAt: NOW,
    });

  it("starts_open_and_completes_once", () => {
    const f = followUp();
    expect(f.state).toBe("open");
    const done = f.complete(LATER);
    expect(done.state).toBe("done");
    expect(done.doneAt).toEqual(LATER);
    expect(f.state).toBe("open"); // immutable
    expect(() => done.complete(LATER)).toThrow(InvalidFollowUpTransitionError);
  });

  it("rejects_a_blank_text", () => {
    expect(() =>
      FollowUp.create({ id: "f1", investorId: "sara", text: " ", dueAt: LATER, createdAt: NOW }),
    ).toThrow(InvalidFollowUpError);
  });

  it("is_overdue_only_while_open_and_past_due", () => {
    const f = followUp();
    expect(f.isOverdue(new Date("2026-07-26T00:00:00Z"))).toBe(true);
    expect(f.isOverdue(new Date("2026-07-24T00:00:00Z"))).toBe(false);
    expect(f.complete(LATER).isOverdue(new Date("2026-07-26T00:00:00Z"))).toBe(false);
  });

  // 1.7d: the due-reminder scanner runs repeatedly, so a follow-up must be
  // announced exactly ONCE — being overdue is not enough, it must be un-announced.
  it("needs_a_due_notice_only_once", () => {
    const overdue = new Date("2026-07-26T00:00:00Z");
    const f = followUp();
    expect(f.needsDueNotice(overdue)).toBe(true);
    expect(f.needsDueNotice(new Date("2026-07-24T00:00:00Z"))).toBe(false); // not due yet

    const announced = f.markDueNotified(overdue);
    expect(announced.dueNotifiedAt).toEqual(overdue);
    expect(announced.needsDueNotice(overdue)).toBe(false); // never twice
    expect(f.needsDueNotice(overdue)).toBe(true); // immutable
  });

  it("keeps_the_first_notice_time_when_marked_again", () => {
    const first = new Date("2026-07-26T00:00:00Z");
    const announced = followUp().markDueNotified(first);
    expect(announced.markDueNotified(new Date("2026-07-27T00:00:00Z"))).toBe(announced);
  });

  it("does_not_need_a_notice_once_completed", () => {
    const overdue = new Date("2026-07-26T00:00:00Z");
    expect(followUp().complete(LATER).needsDueNotice(overdue)).toBe(false);
  });
});
