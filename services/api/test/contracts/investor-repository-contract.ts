import { beforeEach, describe, expect, it } from "vitest";
import { EmailAddress } from "../../src/domain/identity/email-address.js";
import { Investor } from "../../src/domain/identity/investor.js";
import { KycStatus } from "../../src/domain/identity/kyc-status.js";
import type { InvestorRepository } from "../../src/application/identity/ports.js";

// LSP contract: every InvestorRepository implementation must pass this suite unchanged.
export const investorRepositoryContract = (
  name: string,
  makeRepo: () => Promise<InvestorRepository>,
): void => {
  describe(`InvestorRepository contract — ${name}`, () => {
    let repo: InvestorRepository;

    beforeEach(async () => {
      repo = await makeRepo();
    });

    it("returns_undefined_for_an_unknown_id", async () => {
      expect(await repo.findById("missing")).toBeUndefined();
    });

    it("returns_undefined_for_an_unknown_email", async () => {
      expect(await repo.findByEmail(EmailAddress.of("nobody@example.com"))).toBeUndefined();
    });

    it("round_trips_a_new_investor_by_id", async () => {
      await repo.save(Investor.register("inv-1", EmailAddress.of("a@example.com")));

      const found = await repo.findById("inv-1");
      expect(found?.id).toBe("inv-1");
      expect(found?.email.value).toBe("a@example.com");
      expect(found?.kycStatus.state).toBe("draft");
    });

    it("finds_an_investor_by_email", async () => {
      await repo.save(Investor.register("inv-1", EmailAddress.of("a@example.com")));

      const found = await repo.findByEmail(EmailAddress.of("a@example.com"));
      expect(found?.id).toBe("inv-1");
    });

    it("save_overwrites_the_existing_state", async () => {
      const investor = Investor.register("inv-1", EmailAddress.of("a@example.com"));
      await repo.save(investor);
      await repo.save(investor.submitKyc());

      const found = await repo.findById("inv-1");
      expect(found?.kycStatus.state).toBe("submitted");
    });

    it("round_trips_a_rejection_reason", async () => {
      const rejected = Investor.restore(
        "inv-1",
        EmailAddress.of("a@example.com"),
        KycStatus.restore("rejected", "document mismatch"),
      );
      await repo.save(rejected);

      const found = await repo.findById("inv-1");
      expect(found?.kycStatus.state).toBe("rejected");
      expect(found?.kycStatus.rejectionReason).toBe("document mismatch");
    });

    it("round_trips_the_absence_of_a_rejection_reason", async () => {
      await repo.save(
        Investor.restore("inv-1", EmailAddress.of("a@example.com"), KycStatus.restore("approved")),
      );

      const found = await repo.findById("inv-1");
      expect(found?.kycStatus.rejectionReason).toBeUndefined();
    });
  });
};
