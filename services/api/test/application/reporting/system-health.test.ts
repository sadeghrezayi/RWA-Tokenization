import { describe, expect, it } from "vitest";
import { GetSystemHealth } from "../../../src/application/reporting/system-health.js";
import type { HealthProbe } from "../../../src/application/reporting/ports.js";

const probe = (overrides: Partial<HealthProbe>): HealthProbe => ({
  postgres: () => Promise.resolve(true),
  ipfs: () => Promise.resolve(true),
  chain: () => Promise.resolve({ reachable: true, blockNumber: 42 }),
  pausedTokenCount: () => Promise.resolve(0),
  approvedWithoutOnchainIdentity: () => Promise.resolve(0),
  allocationsAwaitingMint: () => Promise.resolve({ count: 0, heldRial: 0n }),
  ...overrides,
});

describe("GetSystemHealth", () => {
  it("reports_healthy_when_every_dependency_is_up", async () => {
    const health = await new GetSystemHealth(probe({})).execute();
    expect(health).toEqual({
      overall: "healthy",
      services: { api: "up", postgres: "up", ipfs: "up", chain: "up" },
      chainBlockNumber: 42,
      pausedTokens: 0,
      approvedWithoutOnchainIdentity: 0,
      allocationsAwaitingMint: { count: 0, heldRial: "0" },
    });
  });

  // K-2: an outage during approval leaves an investor approved with nothing on
  // chain — identity deployment is the first chain call, so it is what fails
  // first. Those people cannot hold anything until someone reissues the claim,
  // and until this count existed nobody could tell WHO. Deliberately narrow:
  // it counts a definite subset, not everyone who might need recovery.
  it("counts the approved investors the chain never heard about", async () => {
    const health = await new GetSystemHealth(
      probe({ approvedWithoutOnchainIdentity: () => Promise.resolve(3) }),
    ).execute();

    expect(health.approvedWithoutOnchainIdentity).toBe(3);
    // Not a dependency being down: the platform is up, some work is owed.
    expect(health.overall).toBe("healthy");
  });

  it("reports_degraded_when_a_dependency_is_down", async () => {
    const health = await new GetSystemHealth(
      probe({ ipfs: () => Promise.resolve(false) }),
    ).execute();
    expect(health.overall).toBe("degraded");
    expect(health.services.ipfs).toBe("down");
  });

  it("marks_the_chain_down_when_unreachable_and_omits_the_block", async () => {
    const health = await new GetSystemHealth(
      probe({ chain: () => Promise.resolve({ reachable: false }) }),
    ).execute();
    expect(health.services.chain).toBe("down");
    expect(health.chainBlockNumber).toBeUndefined();
    expect(health.overall).toBe("degraded");
  });

  it("surfaces_paused_tokens_as_a_warning_signal_but_stays_healthy", async () => {
    const health = await new GetSystemHealth(
      probe({ pausedTokenCount: () => Promise.resolve(2) }),
    ).execute();
    expect(health.pausedTokens).toBe(2);
    expect(health.overall).toBe("healthy");
  });

  // P0-2 step 3 residue (K-34). Money is captured only once the tokens exist,
  // so a mint that never succeeds leaves the investor's Rial sitting in escrow
  // indefinitely. Nothing released it and nothing listed it — an operator could
  // not even tell it was happening. This is the at-a-glance signal; it decides
  // no policy, it only makes the state visible.
  it("counts allocations still holding money for tokens that do not exist", async () => {
    const health = await new GetSystemHealth(
      probe({
        allocationsAwaitingMint: () => Promise.resolve({ count: 2, heldRial: 140_000n }),
      }),
    ).execute();

    expect(health.allocationsAwaitingMint).toEqual({ count: 2, heldRial: "140000" });
    // Same reasoning as the K-2 count: owed work is not a dependency outage.
    // Flipping to "degraded" here would cry wolf through every recovery.
    expect(health.overall).toBe("healthy");
  });

  it("renders the held amount as a string, so no Rial total is rounded away", async () => {
    // Rial totals are bigint precisely because they outgrow a float. Serialising
    // through JSON.stringify would throw on a bigint, and a Number() would
    // silently lose the low digits of a large escrow.
    const health = await new GetSystemHealth(
      probe({
        allocationsAwaitingMint: () =>
          Promise.resolve({ count: 1, heldRial: 9_007_199_254_740_993n }),
      }),
    ).execute();

    expect(health.allocationsAwaitingMint.heldRial).toBe("9007199254740993");
  });
});
