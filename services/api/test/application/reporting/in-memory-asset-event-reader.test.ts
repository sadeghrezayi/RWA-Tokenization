import { FixedClock } from "../../fakes/offering-fakes.js";
import { InMemoryAssetEventStore } from "../../fakes/registry-fakes.js";
import { assetEventReaderContract } from "../../contracts/asset-event-reader-contract.js";

// A fixed clock gives every append the same timestamp, so this consumer also
// pins the insertion-order tie-break the Prisma adapter must match.
assetEventReaderContract("InMemoryAssetEventStore", () => {
  const store = new InMemoryAssetEventStore(new FixedClock(new Date("2026-07-14T00:00:00Z")));
  return Promise.resolve({ log: store, reader: store });
});
