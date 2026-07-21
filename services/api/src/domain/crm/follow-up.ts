import { InvalidFollowUpError, InvalidFollowUpTransitionError } from "./errors.js";

// A dated follow-up reminder on an investor: open until an officer completes
// it; overdue while open past its due date.
export type FollowUpState = "open" | "done";

export interface CreateFollowUpFields {
  id: string;
  investorId: string;
  text: string;
  dueAt: Date;
  createdAt: Date;
}

export class FollowUp {
  private constructor(
    public readonly id: string,
    public readonly investorId: string,
    public readonly text: string,
    public readonly dueAt: Date,
    public readonly createdAt: Date,
    public readonly state: FollowUpState,
    public readonly doneAt: Date | undefined,
  ) {}

  static create(fields: CreateFollowUpFields): FollowUp {
    const text = fields.text.trim();
    if (text === "") {
      throw new InvalidFollowUpError("a follow-up must have text");
    }
    return new FollowUp(
      fields.id,
      fields.investorId,
      text,
      fields.dueAt,
      fields.createdAt,
      "open",
      undefined,
    );
  }

  static restore(fields: {
    id: string;
    investorId: string;
    text: string;
    dueAt: Date;
    createdAt: Date;
    state: FollowUpState;
    doneAt: Date | undefined;
  }): FollowUp {
    return new FollowUp(
      fields.id,
      fields.investorId,
      fields.text,
      fields.dueAt,
      fields.createdAt,
      fields.state,
      fields.doneAt,
    );
  }

  complete(at: Date): FollowUp {
    if (this.state !== "open") {
      throw new InvalidFollowUpTransitionError("only an open follow-up can be completed");
    }
    return new FollowUp(
      this.id,
      this.investorId,
      this.text,
      this.dueAt,
      this.createdAt,
      "done",
      at,
    );
  }

  isOverdue(now: Date): boolean {
    return this.state === "open" && this.dueAt.getTime() < now.getTime();
  }
}
