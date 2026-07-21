import { InvalidNoteError } from "./errors.js";

// A timestamped officer note on an investor — the write side of the CRM
// activity timeline.
export interface WriteNoteFields {
  id: string;
  investorId: string;
  authorId: string;
  text: string;
  at: Date;
}

export class CrmNote {
  private constructor(
    public readonly id: string,
    public readonly investorId: string,
    public readonly authorId: string,
    public readonly text: string,
    public readonly at: Date,
  ) {}

  static write(fields: WriteNoteFields): CrmNote {
    const text = fields.text.trim();
    if (text === "") {
      throw new InvalidNoteError("a note must have text");
    }
    return new CrmNote(fields.id, fields.investorId, fields.authorId, text, fields.at);
  }
}
