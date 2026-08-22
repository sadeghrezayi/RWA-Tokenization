import { describe, expect, it } from "vitest";
import { KycClaimOutboxHandler } from "../../src/infrastructure/outbox/kyc-claim-outbox-handler.js";
import { KYC_CLAIM_OUTBOX_TYPE } from "../../src/application/identity/kyc-claim-outbox.js";
import { RecordingClaimIssuer } from "../fakes/identity-fakes.js";

// P0-2: the half that performs what an approval asked for. Throwing is the
// contract — the drainer reads it as "not yet", reschedules with backoff, and
// eventually parks the message where a person can see it.
describe("KycClaimOutboxHandler", () => {
  it("issues the claim the approval recorded", async () => {
    const claims = new RecordingClaimIssuer();

    await new KycClaimOutboxHandler(claims).handle({ investorId: "inv-1" });

    expect(claims.issuedFor).toEqual(["inv-1"]);
  });

  it("answers the type the producer enqueues, or the drainer would never call it", () => {
    expect(new KycClaimOutboxHandler(new RecordingClaimIssuer()).type).toBe(KYC_CLAIM_OUTBOX_TYPE);
  });

  it("lets a chain failure through, so the drainer retries it", async () => {
    const claims = new RecordingClaimIssuer();
    claims.failWith = new Error("connect ECONNREFUSED 127.0.0.1:8545");

    await expect(new KycClaimOutboxHandler(claims).handle({ investorId: "inv-1" })).rejects.toThrow(
      /ECONNREFUSED/,
    );
  });

  it("says plainly when the message itself is malformed", async () => {
    // Distinguishable from an outage in the log: this one will never succeed,
    // however many times it is retried.
    await expect(
      new KycClaimOutboxHandler(new RecordingClaimIssuer()).handle({ investorId: 42 }),
    ).rejects.toThrow(/invalid .* payload/);
  });
});
