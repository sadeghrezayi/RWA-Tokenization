import { assetRepositoryContract } from "../../contracts/asset-repository-contract.js";
import { InMemoryAssetRepository } from "../../fakes/asset-fakes.js";

assetRepositoryContract("in-memory fake", () => Promise.resolve(new InMemoryAssetRepository()));
