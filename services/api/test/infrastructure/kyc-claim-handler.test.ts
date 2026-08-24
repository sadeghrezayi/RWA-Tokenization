import { beforeEach, describe, expect, it } from "vitest";
import { KycClaimHandler } from "../../src/infrastructure/outbox/kyc-claim-handler.js";
import { KYC_CLAIM_TYPE } from "../../src/application/identity/approve-kyc.js";
import { RecordingClaimIssuer } from "../fakes/identity-fakes.js";

// P0-2 step 4: the queued retry of a KYC claim, so a devnet outage during an
// approval heals itself instead of waiting for an officer to notice.
describe("KycClaimHandler", () => {
  let claims: RecordingClaimIssuer;
  let handler: KycClaimHandler;

  beforeEach(() => {
    claims = new RecordingClaimIssuer();
    handler = new KycClaimHandler(claims);
  });

  it("registers for the type the approval enqueues", () => {
    expect(handler.type).toBe(KYC_CLAIM_TYPE);
  });

  it("issues the claim for the investor the payload names", async () => {
    await handler.handle({ investorId: "inv-1" });

    expect(claims.issuedFor).toEqual(["inv-1"]);
  });

  it("refuses a malformed payload with a message naming the problem", async () => {
    await expect(handler.handle({})).rejects.toThrow(/investorId/);
    expect(claims.issuedFor).toEqual([]);
  });

  it("lets a still-unreachable chain throw, so the outbox retries", async () => {
    claims.failWith = new Error("connect ECONNREFUSED 127.0.0.1:8545");

    await expect(handler.handle({ investorId: "inv-1" })).rejects.toThrow(/ECONNREFUSED/);
  });
});
