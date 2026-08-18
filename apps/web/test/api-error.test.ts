import { describe, expect, it, vi, afterEach } from "vitest";
import { ApiError, createApiClient } from "../lib/api";

const respondWith = (status: number, body: unknown, statusText = "") => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: false,
      status,
      statusText,
      json: () => Promise.resolve(body),
    }),
  );
};

afterEach(() => {
  vi.unstubAllGlobals();
});

// A failure that carries no words renders as an empty red box: the reader is
// told something went wrong and nothing else. It happened for real — the exit
// journey caught a portfolio page showing `ALERT: ` with no text — because
// `??` does not catch an empty string and HTTP/2 has no status text.
describe("ApiError messages", () => {
  it("never throws an error with no message", async () => {
    respondWith(401, { message: "" });

    const failure = await createApiClient("http://api.test")
      .getPortfolio()
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ApiError);
    expect((failure as ApiError).message.trim()).not.toBe("");
  });

  it("says the status when the server explains nothing at all", async () => {
    respondWith(503, {});

    const failure = (await createApiClient("http://api.test")
      .getPortfolio()
      .catch((error: unknown) => error)) as ApiError;

    expect(failure.message).toContain("503");
  });

  it("keeps the server's own words when it has any", async () => {
    respondWith(403, { message: "you do not act for this issuer organisation" });

    const failure = (await createApiClient("http://api.test")
      .getPortfolio()
      .catch((error: unknown) => error)) as ApiError;

    expect(failure.message).toBe("you do not act for this issuer organisation");
  });
});
