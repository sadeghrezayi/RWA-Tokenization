import { describe, expect, it, vi, afterEach } from "vitest";
import { chainProvider } from "../../src/infrastructure/chain/chain-provider.js";

// K-30: a provider built the plain way probes for the network on construction
// and, when the node is unreachable, retries FOREVER in the background — one
// loop per construction, accumulating, long after the call site caught its own
// error. Under the API's timing that escaped as an uncaught exception and the
// process exited: a devnet outage took the whole platform down.
//
// The retry loop is the defect, so the retry loop is what these assert.
const DEAD = "http://127.0.0.1:9";

const countingDetectionWarnings = () => {
  let count = 0;
  const spy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    if (String(args[0]).includes("failed to detect network")) count += 1;
  });
  return { spy, count: () => count };
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("chainProvider", () => {
  it("surfaces an unreachable node at the call site", async () => {
    const provider = chainProvider(DEAD);

    await expect(provider.getBlockNumber()).rejects.toThrow(/ECONNREFUSED|could not detect/i);

    provider.destroy();
  });

  it("leaves nothing retrying in the background once the caller has its answer", async () => {
    const warnings = countingDetectionWarnings();
    const provider = chainProvider(DEAD);
    await provider.getBlockNumber().catch(() => undefined);

    // Long enough for a 1s retry loop to announce itself several times over.
    await new Promise((resolve) => setTimeout(resolve, 2_500));

    expect(warnings.count(), "the provider is still probing after the call finished").toBe(0);
    provider.destroy();
  }, 10_000);

  it("does not multiply those loops per construction", async () => {
    const warnings = countingDetectionWarnings();
    const providers = Array.from({ length: 5 }, () => chainProvider(DEAD));
    await Promise.all(providers.map((p) => p.getBlockNumber().catch(() => undefined)));

    await new Promise((resolve) => setTimeout(resolve, 2_500));

    // Five health checks during an outage used to leave five permanent loops.
    expect(warnings.count()).toBe(0);
    for (const provider of providers) provider.destroy();
  }, 10_000);
});
