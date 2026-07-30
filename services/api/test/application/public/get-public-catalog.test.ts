import { describe, expect, it } from "vitest";
import { GetPublicCatalog } from "../../../src/application/public/get-public-catalog.js";
import { Offering } from "../../../src/domain/offerings/offering.js";
import { Asset } from "../../../src/domain/assets/asset.js";
import { InMemoryOfferingRepository } from "../../fakes/offering-fakes.js";
import { InMemoryAssetRepository } from "../../fakes/asset-fakes.js";

const OPENS = new Date("2026-07-01T00:00:00Z");
const DURING = new Date("2026-07-05T12:00:00Z");
const CLOSES = new Date("2026-08-10T00:00:00Z");
const PUBLISHED = new Date("2026-07-02T00:00:00Z");

const offering = (id: string, assetId = "asset-1"): Offering =>
  Offering.create({
    id,
    assetId,
    tokenAddress: "0xToken1",
    supply: 100n,
    priceRial: 1_000_000n,
    minPerInvestor: 5n,
    maxPerInvestor: 80n,
    minimumRaise: 20n,
    opensAt: OPENS,
    closesAt: CLOSES,
  });

const setup = async (offerings: Offering[], assets: Asset[] = []) => {
  const offeringRepo = new InMemoryOfferingRepository();
  for (const o of offerings) await offeringRepo.save(o);
  const assetRepo = new InMemoryAssetRepository();
  for (const a of assets) await assetRepo.save(a);
  return new GetPublicCatalog(offeringRepo, assetRepo);
};

describe("GetPublicCatalog", () => {
  it("lists nothing when no offering has been published", async () => {
    const catalog = await setup([offering("off-draft"), offering("off-open").open(DURING)]);
    expect(await catalog.list()).toEqual([]);
  });

  it("lists only published, still-open offerings", async () => {
    const catalog = await setup([
      offering("off-draft"),
      offering("off-open-private").open(DURING),
      offering("off-listed").open(DURING).publish(PUBLISHED),
    ]);

    const listed = await catalog.list();
    expect(listed.map((o) => o.id)).toEqual(["off-listed"]);
  });

  it("drops an offering that was published then withdrawn", async () => {
    const catalog = await setup([offering("off-1").open(DURING).publish(PUBLISHED).unpublish()]);
    expect(await catalog.list()).toEqual([]);
  });

  it("exposes only factual terms — never a projected return (OD-21)", async () => {
    const catalog = await setup([offering("off-1").open(DURING).publish(PUBLISHED)]);

    const [item] = await catalog.list();

    expect(item).toBeDefined();
    expect(item?.priceRial).toBe("1000000");
    expect(item?.supply).toBe("100");
    expect(item?.closesAt).toBe(CLOSES.toISOString());
    expect(item?.publishedAt).toBe(PUBLISHED.toISOString());
    // No forward-looking figure may appear on a public page.
    expect(Object.keys(item ?? {})).not.toContain("projectedYield");
    expect(Object.keys(item ?? {})).not.toContain("expectedReturn");
  });

  it("never leaks who subscribed, or how much they hold", async () => {
    const withInvestors = offering("off-1")
      .open(DURING)
      .subscribe("inv-secret", 10n, DURING)
      .publish(PUBLISHED);
    const catalog = await setup([withInvestors]);

    const [item] = await catalog.list();

    expect(JSON.stringify(item)).not.toContain("inv-secret");
  });

  it("returns a published offering by id, and hides an unpublished one", async () => {
    const catalog = await setup([
      offering("off-listed").open(DURING).publish(PUBLISHED),
      offering("off-private").open(DURING),
    ]);

    expect((await catalog.byId("off-listed"))?.id).toBe("off-listed");
    // Not "forbidden" — an unlisted offering simply does not exist publicly.
    expect(await catalog.byId("off-private")).toBeUndefined();
    expect(await catalog.byId("nope")).toBeUndefined();
  });
});
