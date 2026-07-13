import { attestationRepositoryContract } from "../../contracts/attestation-repository-contract.js";
import { InMemoryAttestationRepository } from "../../fakes/attestation-fakes.js";

attestationRepositoryContract("in-memory fake", () =>
  Promise.resolve(new InMemoryAttestationRepository()),
);
