import { beforeEach, describe, expect, it } from "vitest";
import { EmailAddress } from "../../src/domain/identity/email-address.js";
import { Investor } from "../../src/domain/identity/investor.js";
import { KycStatus } from "../../src/domain/identity/kyc-status.js";
import { PasswordHash } from "../../src/domain/identity/password-hash.js";
import type { InvestorRepository } from "../../src/application/identity/ports.js";

const newInvestor = (id: string, email: string) =>
  Investor.register(id, EmailAddress.of(email), PasswordHash.of(`hashed:${id}`));

const restoredInvestor = (id: string, email: string, kyc: KycStatus) =>
  Investor.restore(id, EmailAddress.of(email), PasswordHash.of(`hashed:${id}`), kyc);

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

    it("round_trips_a_new_investor_by_id_including_credentials", async () => {
      await repo.save(newInvestor("inv-1", "a@example.com"));

      const found = await repo.findById("inv-1");
      expect(found?.id).toBe("inv-1");
      expect(found?.email.value).toBe("a@example.com");
      expect(found?.passwordHash.value).toBe("hashed:inv-1");
      expect(found?.kycStatus.state).toBe("draft");
    });

    it("finds_an_investor_by_email", async () => {
      await repo.save(newInvestor("inv-1", "a@example.com"));

      const found = await repo.findByEmail(EmailAddress.of("a@example.com"));
      expect(found?.id).toBe("inv-1");
    });

    it("finds_investors_by_kyc_states_only", async () => {
      await repo.save(restoredInvestor("inv-1", "a@example.com", KycStatus.restore("draft")));
      await repo.save(restoredInvestor("inv-2", "b@example.com", KycStatus.restore("submitted")));
      await repo.save(restoredInvestor("inv-3", "c@example.com", KycStatus.restore("in_review")));
      await repo.save(restoredInvestor("inv-4", "d@example.com", KycStatus.restore("approved")));

      const pending = await repo.findByKycStates(["submitted", "in_review"]);
      expect(pending.map((i) => i.id).sort()).toEqual(["inv-2", "inv-3"]);

      expect(await repo.findByKycStates(["expired"])).toEqual([]);
    });

    it("finds_all_investors_empty_then_everyone", async () => {
      expect(await repo.findAll()).toEqual([]);

      await repo.save(newInvestor("inv-1", "a@example.com"));
      await repo.save(newInvestor("inv-2", "b@example.com"));

      const all = await repo.findAll();
      expect(all.map((i) => i.id).sort()).toEqual(["inv-1", "inv-2"]);
    });

    it("save_overwrites_the_existing_state", async () => {
      const investor = newInvestor("inv-1", "a@example.com");
      await repo.save(investor);
      await repo.save(investor.submitKyc());

      const found = await repo.findById("inv-1");
      expect(found?.kycStatus.state).toBe("submitted");
    });

    it("round_trips_a_rejection_reason", async () => {
      await repo.save(
        restoredInvestor("inv-1", "a@example.com", KycStatus.restore("rejected", "document mismatch")),
      );

      const found = await repo.findById("inv-1");
      expect(found?.kycStatus.state).toBe("rejected");
      expect(found?.kycStatus.rejectionReason).toBe("document mismatch");
    });

    it("round_trips_the_absence_of_a_rejection_reason", async () => {
      await repo.save(restoredInvestor("inv-1", "a@example.com", KycStatus.restore("approved")));

      const found = await repo.findById("inv-1");
      expect(found?.kycStatus.rejectionReason).toBeUndefined();
    });
  });
};
