import { allocationMintLogContract } from "../../contracts/allocation-mint-log-contract.js";
import { InMemoryAllocationMintLog } from "../../fakes/offering-fakes.js";

allocationMintLogContract("in-memory", () => Promise.resolve(new InMemoryAllocationMintLog()));
