import { transferRepositoryContract } from "../../contracts/transfer-repository-contract.js";
import { InMemoryTransferRepository } from "../../fakes/transfer-fakes.js";

transferRepositoryContract("in-memory fake", () =>
  Promise.resolve(new InMemoryTransferRepository()),
);
