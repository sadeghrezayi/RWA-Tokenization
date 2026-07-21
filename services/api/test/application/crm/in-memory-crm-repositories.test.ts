import {
  crmNoteRepositoryContract,
  crmProfileRepositoryContract,
  followUpRepositoryContract,
} from "../../contracts/crm-repositories-contract.js";
import {
  InMemoryCrmNoteRepository,
  InMemoryCrmProfileRepository,
  InMemoryFollowUpRepository,
} from "../../fakes/crm-fakes.js";

crmProfileRepositoryContract("InMemory", () => Promise.resolve(new InMemoryCrmProfileRepository()));
crmNoteRepositoryContract("InMemory", () => Promise.resolve(new InMemoryCrmNoteRepository()));
followUpRepositoryContract("InMemory", () => Promise.resolve(new InMemoryFollowUpRepository()));
