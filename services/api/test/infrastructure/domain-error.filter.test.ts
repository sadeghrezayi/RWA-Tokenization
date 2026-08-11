import { describe, expect, it, vi } from "vitest";
import { ConflictException } from "@nestjs/common";
import type { ArgumentsHost } from "@nestjs/common";
import { DomainErrorFilter } from "../../src/infrastructure/http/domain-error.filter.js";
import { InsufficientFundsError } from "../../src/application/offerings/errors.js";

const capture = () => {
  const json = vi.fn();
  const response = {
    status: vi.fn(() => ({ json })),
    setHeader: vi.fn(),
  };
  const host = {
    switchToHttp: () => ({ getResponse: () => response }),
  } as unknown as ArgumentsHost;
  return { host, response, json };
};

describe("DomainErrorFilter", () => {
  it("keeps the cause of a 500 out of the response but writes it to the log", () => {
    // An operator who sees "internal server error" and finds nothing in the log
    // has no way to diagnose anything. The client still learns nothing.
    const log = { error: vi.fn() };
    const { host, response, json } = capture();

    new DomainErrorFilter(log).catch(new Error("the ledger connection dropped"), host);

    expect(response.status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({ statusCode: 500, message: "internal server error" });
    const logged = String(log.error.mock.calls[0]?.[0] ?? "");
    expect(logged).toContain("the ledger connection dropped");
  });

  it("logs a 500 that arrives as an HttpException too", async () => {
    // The gap this closes: an explicit 500 took the HttpException fast path and
    // was never logged, so a CI failure showed "internal server error" with
    // nothing anywhere to explain it.
    const { InternalServerErrorException } = await import("@nestjs/common");
    const log = { error: vi.fn() };
    const { host, response } = capture();

    new DomainErrorFilter(log).catch(new InternalServerErrorException("upstream exploded"), host);

    expect(response.status).toHaveBeenCalledWith(500);
    expect(String(log.error.mock.calls[0]?.[0] ?? "")).toContain("upstream exploded");
  });

  it("stays quiet about refusals that are working as designed", () => {
    // A 409 is the system doing its job. Logging it as an error would bury the
    // incidents that matter.
    const log = { error: vi.fn() };
    const { host, response } = capture();

    new DomainErrorFilter(log).catch(new InsufficientFundsError(), host);

    expect(response.status).toHaveBeenCalledWith(409);
    expect(log.error).not.toHaveBeenCalled();
  });

  it("passes an explicit HTTP exception through untouched and unlogged", () => {
    const log = { error: vi.fn() };
    const { host, response, json } = capture();

    new DomainErrorFilter(log).catch(new ConflictException("already confirmed"), host);

    expect(response.status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ message: "already confirmed" }) as unknown,
    );
    expect(log.error).not.toHaveBeenCalled();
  });
});
