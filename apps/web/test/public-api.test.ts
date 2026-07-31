import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchPublicOffering, fetchPublicOfferings } from "../lib/public-api";

const mockFetch = (impl: () => Promise<Response> | Response) => {
  vi.stubGlobal("fetch", vi.fn().mockImplementation(impl));
};

const ok = (body: unknown): Response =>
  ({ ok: true, json: () => Promise.resolve(body) }) as unknown as Response;
const status = (code: number): Response => ({ ok: false, status: code }) as unknown as Response;

afterEach(() => {
  vi.unstubAllGlobals();
});

// 2.2: these run on the server, so their failure behaviour decides what a
// visitor is told. The distinction that matters: an EMPTY catalog and an
// UNREADABLE one must not look the same to the page.
describe("fetchPublicOfferings", () => {
  it("returns the published offerings", async () => {
    mockFetch(() => ok([{ id: "off-1" }]));
    expect(await fetchPublicOfferings()).toEqual([{ id: "off-1" }]);
  });

  it("distinguishes a genuinely empty catalog from a broken one", async () => {
    mockFetch(() => ok([]));
    expect(await fetchPublicOfferings()).toEqual([]); // empty, and we know it

    mockFetch(() => Promise.reject(new Error("connection refused")));
    // undefined, NOT [] — the page must be able to say "could not load".
    expect(await fetchPublicOfferings()).toBeUndefined();
  });

  it("returns undefined when the API answers with an error status", async () => {
    mockFetch(() => status(500));
    expect(await fetchPublicOfferings()).toBeUndefined();
  });

  it("never lets a fetch rejection escape into the page render", async () => {
    mockFetch(() => Promise.reject(new Error("boom")));
    await expect(fetchPublicOfferings()).resolves.toBeUndefined();
  });
});

describe("fetchPublicOffering", () => {
  it("returns a listed offering", async () => {
    mockFetch(() => ok({ id: "off-1", assetName: "Vanak Tower" }));
    expect((await fetchPublicOffering("off-1"))?.assetName).toBe("Vanak Tower");
  });

  it("treats an unlisted offering (404) as simply absent", async () => {
    mockFetch(() => status(404));
    expect(await fetchPublicOffering("off-private")).toBeUndefined();
  });

  it("encodes the id so a crafted path cannot escape the endpoint", async () => {
    const spy = vi.fn().mockResolvedValue(status(404));
    vi.stubGlobal("fetch", spy);

    await fetchPublicOffering("../../admin/secrets");

    const url = String(spy.mock.calls[0]?.[0]);
    expect(url).toContain("%2F"); // slashes encoded, not traversed
    expect(url).not.toContain("/admin/secrets");
  });
});
