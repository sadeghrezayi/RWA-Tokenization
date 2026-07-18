import { redemptionRepositoryContract } from "../../contracts/redemption-repository-contract.js";
import { InMemoryRedemptionRepository } from "../../fakes/redemption-fakes.js";

redemptionRepositoryContract("in-memory fake", () =>
  Promise.resolve(new InMemoryRedemptionRepository()),
);
