import { distributionRepositoryContract } from "../../contracts/distribution-repository-contract.js";
import { InMemoryDistributionRepository } from "../../fakes/distribution-fakes.js";

distributionRepositoryContract("in-memory fake", () =>
  Promise.resolve(new InMemoryDistributionRepository()),
);
