import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import type { AssetEventLog } from "../../src/application/assets/ports.js";
import type { AssetEventReader } from "../../src/application/reporting/ports.js";

// LSP contract for the audit-log pair: whatever the log appends, the reader
// serves newest first with filter and limit. Asset ids are randomized so the
// suite is safe against a shared database; ids/timestamps are adapter-owned,
// so assertions are on relative order and round-tripped content only.
export const assetEventReaderContract = (
  name: string,
  makePair: () => Promise<{ log: AssetEventLog; reader: AssetEventReader }>,
): void => {
  describe(`AssetEventReader contract — ${name}`, () => {
    let log: AssetEventLog;
    let reader: AssetEventReader;
    let assetA: string;
    let assetB: string;

    beforeEach(async () => {
      ({ log, reader } = await makePair());
      assetA = `contract-a-${randomUUID()}`;
      assetB = `contract-b-${randomUUID()}`;
    });

    it("serves_appended_events_newest_first_with_content_round_tripped", async () => {
      await log.append({ assetId: assetA, event: "asset_proposed", actor: "officer-1" });
      await log.append({
        assetId: assetA,
        event: "tokens_transferred",
        actor: "sara",
        details: { to: "bob", tokens: "15" },
      });
      await log.append({ assetId: assetA, event: "tokens_burned", actor: "officer-1" });

      const rows = await reader.list({ assetId: assetA });

      expect(rows.map((r) => r.event)).toEqual([
        "tokens_burned",
        "tokens_transferred",
        "asset_proposed",
      ]);
      expect(rows[1]).toMatchObject({
        assetId: assetA,
        actor: "sara",
        details: { to: "bob", tokens: "15" },
      });
      // Events appended without details read back as an empty record.
      expect(rows[0]?.details).toEqual({});
      expect(rows[0]?.at).toBeInstanceOf(Date);
      expect(rows[0]?.id).not.toBe(rows[1]?.id);
    });

    it("respects_the_limit_keeping_the_newest", async () => {
      await log.append({ assetId: assetA, event: "first", actor: "x" });
      await log.append({ assetId: assetA, event: "second", actor: "x" });
      await log.append({ assetId: assetA, event: "third", actor: "x" });

      const rows = await reader.list({ assetId: assetA, limit: 2 });

      expect(rows.map((r) => r.event)).toEqual(["third", "second"]);
    });

    it("filters_by_asset", async () => {
      await log.append({ assetId: assetA, event: "a-event", actor: "x" });
      await log.append({ assetId: assetB, event: "b-event", actor: "x" });

      const rows = await reader.list({ assetId: assetA });

      expect(rows).toHaveLength(1);
      expect(rows[0]?.event).toBe("a-event");
    });

    it("spans_assets_newest_first_when_unfiltered", async () => {
      await log.append({ assetId: assetA, event: "older-cross", actor: "x" });
      await log.append({ assetId: assetB, event: "newer-cross", actor: "x" });

      // Shared-database safe: assert containment and relative order of our own
      // rows, not exact equality with the whole table.
      const rows = await reader.list({});
      const events = rows.map((r) => r.event);
      expect(events).toContain("older-cross");
      expect(events).toContain("newer-cross");
      expect(events.indexOf("newer-cross")).toBeLessThan(events.indexOf("older-cross"));
    });
  });
};
