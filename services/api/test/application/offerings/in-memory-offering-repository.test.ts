import { offeringRepositoryContract } from "../../contracts/offering-repository-contract.js";
import { InMemoryOfferingRepository } from "../../fakes/offering-fakes.js";

offeringRepositoryContract("in-memory fake", () =>
  Promise.resolve(new InMemoryOfferingRepository()),
);
