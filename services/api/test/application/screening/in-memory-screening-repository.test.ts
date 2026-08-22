import { screeningRepositoryContract } from "../../contracts/screening-repository-contract.js";
import { InMemoryScreeningRepository } from "../../fakes/screening-fakes.js";

screeningRepositoryContract("in-memory", () => Promise.resolve(new InMemoryScreeningRepository()));
