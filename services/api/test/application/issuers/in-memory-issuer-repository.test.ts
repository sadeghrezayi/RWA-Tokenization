import { issuerRepositoryContract } from "../../contracts/issuer-repository-contract.js";
import { InMemoryIssuerRepository } from "../../fakes/issuer-fakes.js";

issuerRepositoryContract("in-memory", () => Promise.resolve(new InMemoryIssuerRepository()));
