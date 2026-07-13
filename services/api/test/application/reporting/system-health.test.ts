import { describe, expect, it } from "vitest";
import { GetSystemHealth } from "../../../src/application/reporting/system-health.js";
import type { HealthProbe } from "../../../src/application/reporting/ports.js";

const probe = (overrides: Partial<HealthProbe>): HealthProbe => ({
  postgres: () => Promise.resolve(true),
  ipfs: () => Promise.resolve(true),
  chain: () => Promise.resolve({ reachable: true, blockNumber: 42 }),
  pausedTokenCount: () => Promise.resolve(0),
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
    });
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
});
