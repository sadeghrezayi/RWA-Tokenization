import { describe, expect, it, vi, afterEach } from "vitest";
import { Logger } from "@nestjs/common";
import { guardAgainstUnhandledRejections } from "../../src/main.js";

// K-30: Node's default for an unhandled rejection is to EXIT. The chain
// transport emits bare socket rejections nobody is awaiting, so a devnet
// outage killed the API even after the request itself answered correctly.
//
// Registering a listener is what stops the default exit — that is Node's own
// contract — so these assert the two things this code is responsible for: that
// a listener is installed, and that it says something an operator can act on
// rather than swallowing the failure.
afterEach(() => {
  process.removeAllListeners("unhandledRejection");
  vi.restoreAllMocks();
});

describe("guardAgainstUnhandledRejections", () => {
  it("installs the listener that keeps the process alive", () => {
    process.removeAllListeners("unhandledRejection");
    expect(process.listenerCount("unhandledRejection")).toBe(0);

    guardAgainstUnhandledRejections();

    expect(process.listenerCount("unhandledRejection")).toBe(1);
  });

  it("says loudly what escaped, so an outage does not become a mystery", () => {
    const error = vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    guardAgainstUnhandledRejections();

    process.emit(
      "unhandledRejection",
      new Error("connect ECONNREFUSED 127.0.0.1:8545"),
      Promise.resolve(),
    );

    const said = String(error.mock.calls[0]?.[0] ?? "");
    expect(said).toContain("ECONNREFUSED");
    // The operator must be able to tell "we survived" from "we died".
    expect(said).toMatch(/staying up/i);
  });

  it("reports a rejection that is not an Error at all", () => {
    const error = vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    guardAgainstUnhandledRejections();

    process.emit("unhandledRejection", "a bare string", Promise.resolve());

    expect(String(error.mock.calls[0]?.[0] ?? "")).toContain("a bare string");
  });
});
