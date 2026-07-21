import type { AssetRepository } from "../assets/ports.js";
import type { AssetEventReader } from "../reporting/ports.js";
import type { CrmNoteRepository } from "./ports.js";

// The CRM activity timeline: officer notes merged with the investor's own
// platform actions (from the audit log), newest first.
export interface TimelineItemView {
  kind: "note" | "event";
  at: string;
  text: string;
  actor: string;
  assetName?: string;
}

const EVENT_LIMIT = 100;

export class GetInvestorTimeline {
  constructor(
    private readonly notes: CrmNoteRepository,
    private readonly events: AssetEventReader,
    private readonly assets: AssetRepository,
  ) {}

  async execute(input: { investorId: string }): Promise<TimelineItemView[]> {
    const notes = await this.notes.listByInvestor(input.investorId);
    const events = await this.events.list({ actor: input.investorId, limit: EVENT_LIMIT });

    const assetNames = new Map<string, string>();
    const items: TimelineItemView[] = notes.map((note) => ({
      kind: "note" as const,
      at: note.at.toISOString(),
      text: note.text,
      actor: note.authorId,
    }));
    for (const event of events) {
      let assetName = assetNames.get(event.assetId);
      if (assetName === undefined) {
        assetName = (await this.assets.findById(event.assetId))?.name ?? event.assetId;
        assetNames.set(event.assetId, assetName);
      }
      items.push({
        kind: "event",
        at: event.at.toISOString(),
        text: event.event,
        actor: event.actor,
        assetName,
      });
    }
    return items.sort((a, b) => b.at.localeCompare(a.at));
  }
}
