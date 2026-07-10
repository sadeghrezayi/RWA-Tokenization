import { describe, expect, it } from "vitest";
import { ListPendingKyc } from "../../../src/application/identity/list-pending-kyc.js";
import { EmailAddress } from "../../../src/domain/identity/email-address.js";
import { Investor } from "../../../src/domain/identity/investor.js";
import { KycStatus } from "../../../src/domain/identity/kyc-status.js";
import { PasswordHash } from "../../../src/domain/identity/password-hash.js";
import type { KycState } from "../../../src/domain/identity/kyc-status.js";
import { InMemoryInvestorRepository } from "../../fakes/identity-fakes.js";

const investorIn = (id: string, state: KycState) =>
  Investor.restore(
    id,
    EmailAddress.of(`${id}@example.com`),
    PasswordHash.of("hashed:pw"),
    KycStatus.restore(state),
  );

describe("ListPendingKyc", () => {
  it("returns_only_submitted_and_in_review_investors", async () => {
    const investors = new InMemoryInvestorRepository();
    for (const [id, state] of [
      ["inv-1", "draft"],
      ["inv-2", "submitted"],
      ["inv-3", "in_review"],
      ["inv-4", "approved"],
      ["inv-5", "rejected"],
    ] as const) {
      await investors.save(investorIn(id, state));
    }

    const views = await new ListPendingKyc(investors).execute();

    expect(views.map((v) => v.id).sort()).toEqual(["inv-2", "inv-3"]);
    expect(views.every((v) => !v.eligibleForClaims)).toBe(true);
  });

  it("returns_an_empty_list_when_nothing_is_pending", async () => {
    const views = await new ListPendingKyc(new InMemoryInvestorRepository()).execute();
    expect(views).toEqual([]);
  });
});
