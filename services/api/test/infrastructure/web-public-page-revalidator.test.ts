import { describe, expect, it, vi, afterEach } from "vitest";
import { Logger } from "@nestjs/common";
import { WebPublicPageRevalidator } from "../../src/infrastructure/http/web-public-page-revalidator.js";

const warnings = () => {
  const spy = vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
  return {
    spy,
    text: () => spy.mock.calls.map((call) => String(call[0])).join(" | "),
  };
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// 2.2 / KNOWN_ISSUES K-4: when this purge does not happen, a withdrawn offering
// stays advertised for the whole ISR window. The failure is invisible unless
// the log says which of the two causes it was.
describe("WebPublicPageRevalidator", () => {
  it("says the two sides disagree when the purge is rejected", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 401 });
    vi.stubGlobal("fetch", fetchMock);
    const log = warnings();

    await new WebPublicPageRevalidator("http://web.test", "a-secret").offeringChanged("off-1");

    // "returned 401" tells a reader nothing they can act on; the CAUSE does.
    expect(log.text()).toMatch(/REVALIDATE_SECRET/);
    expect(log.text().toLowerCase()).toContain("web");
  });

  it("reports an unreachable web app as what it is, without failing the caller", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("connect ECONNREFUSED 127.0.0.1:3000")),
    );
    const log = warnings();

    await expect(
      new WebPublicPageRevalidator("http://web.test", "a-secret").offeringChanged("off-1"),
    ).resolves.toBeUndefined();

    expect(log.text()).toContain("ECONNREFUSED");
  });

  it("does not call the web app at all when no secret is configured", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await new WebPublicPageRevalidator("http://web.test", undefined).offeringChanged("off-1");

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("purges quietly when it works", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 204 }));
    const log = warnings();

    await new WebPublicPageRevalidator("http://web.test", "a-secret").offeringChanged("off-1");

    expect(log.text()).toBe("");
  });
});
