import { beforeEach, describe, expect, it } from "vitest";
import type { AllocationMintLog } from "../../src/application/offerings/ports.js";

// LSP contract: every AllocationMintLog must pass this unchanged.
//
// The state this exists to protect is the three-way distinction. An adapter
// that collapses "claimed but unconfirmed" into either "unminted" or "minted"
// compiles perfectly and is catastrophic in opposite directions — one
// double-issues tokens, the other silently leaves a paying holder with none.
export const allocationMintLogContract = (
  name: string,
  makeLog: () => Promise<AllocationMintLog>,
  seed: (key: { offeringId: string; investorId: string }) => Promise<void> = () =>
    Promise.resolve(),
): void => {
  describe(`AllocationMintLog contract — ${name}`, () => {
    let log: AllocationMintLog;

    beforeEach(async () => {
      log = await makeLog();
    });

    it("reports an allocation nobody has touched as UNMINTED", async () => {
      expect(await log.stateOf({ offeringId: "off-x", investorId: "nobody" })).toBe("unminted");
    });

    it("reports a claimed-but-unconfirmed allocation as UNRESOLVED, not as either extreme", async () => {
      const key = { offeringId: "off-1", investorId: "alice" };
      await seed(key);

      expect(await log.claim(key, 60n)).toBe(true);

      expect(await log.stateOf(key)).toBe("unresolved");
    });

    it("reports a confirmed allocation as MINTED", async () => {
      const key = { offeringId: "off-1", investorId: "bob" };
      await seed(key);
      await log.claim(key, 40n);

      await log.confirm(key);

      expect(await log.stateOf(key)).toBe("minted");
    });

    it("lets exactly ONE caller claim an allocation", async () => {
      // The guarantee the whole record exists for. In the Prisma adapter this
      // is the unique index doing the work, not the application's read.
      const key = { offeringId: "off-1", investorId: "carol" };
      await seed(key);

      expect(await log.claim(key, 10n)).toBe(true);
      expect(await log.claim(key, 10n)).toBe(false);
    });

    it("keeps allocations for different investors on one offering apart", async () => {
      const alice = { offeringId: "off-2", investorId: "alice" };
      const bob = { offeringId: "off-2", investorId: "bob" };
      await seed(alice);
      await seed(bob);

      await log.claim(alice, 1n);
      await log.confirm(alice);

      expect(await log.stateOf(bob)).toBe("unminted");
    });

    it("keeps the same investor's allocations on different offerings apart", async () => {
      // An investor in two offerings must not have the second suppressed
      // because the first was minted.
      const first = { offeringId: "off-3", investorId: "alice" };
      const second = { offeringId: "off-4", investorId: "alice" };
      await seed(first);
      await seed(second);

      await log.claim(first, 1n);
      await log.confirm(first);

      expect(await log.stateOf(second)).toBe("unminted");
    });
  });
};
