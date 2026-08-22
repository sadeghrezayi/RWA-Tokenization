import { riskAssessmentRepositoryContract } from "../../contracts/risk-assessment-repository-contract.js";
import { InMemoryRiskAssessmentRepository } from "../../fakes/risk-fakes.js";

riskAssessmentRepositoryContract("in-memory", () =>
  Promise.resolve(new InMemoryRiskAssessmentRepository()),
);
