import { investorRepositoryContract } from "../../contracts/investor-repository-contract.js";
import { InMemoryInvestorRepository } from "../../fakes/identity-fakes.js";

investorRepositoryContract("in-memory fake", () =>
  Promise.resolve(new InMemoryInvestorRepository()),
);
