import { Contract, JsonRpcProvider, ZeroAddress } from "ethers";
import type { EventLog } from "ethers";
import type { RegistryEvent } from "../../domain/registry/holder-registry.js";
import type { TokenEventSource } from "../../application/registry/ports.js";

const TOKEN_ABI = [
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "function totalSupply() view returns (uint256)",
];

type SupplyContract = Contract & { totalSupply(): Promise<bigint> };

// FR-RA-1: reads the token's complete Transfer log from genesis and classifies
// it (zero address => mint/burn) in chain order (block number, then log
// index). Timestamps come from the blocks themselves; refs are tx hashes.
export class EthersTokenEventSource implements TokenEventSource {
  constructor(private readonly rpcUrl: string) {}

  async registryEvents(tokenAddress: string): Promise<RegistryEvent[]> {
    const provider = new JsonRpcProvider(this.rpcUrl);
    const token = new Contract(tokenAddress, TOKEN_ABI, provider);
    const logs = (await token.queryFilter("Transfer", 0, "latest")) as EventLog[];
    logs.sort((a, b) =>
      a.blockNumber === b.blockNumber ? a.index - b.index : a.blockNumber - b.blockNumber,
    );

    const blockTimes = new Map<number, Date>();
    const events: RegistryEvent[] = [];
    for (const log of logs) {
      let at = blockTimes.get(log.blockNumber);
      if (at === undefined) {
        const block = await provider.getBlock(log.blockNumber);
        if (block === null) {
          throw new Error(
            `block ${String(log.blockNumber)} vanished while reading the ${tokenAddress} event log`,
          );
        }
        at = new Date(block.timestamp * 1000);
        blockTimes.set(log.blockNumber, at);
      }
      const from = String(log.args[0]);
      const to = String(log.args[1]);
      const tokens = log.args[2] as bigint;
      const ref = log.transactionHash;
      if (from === ZeroAddress) {
        events.push({ kind: "mint", to, tokens, at, ref });
      } else if (to === ZeroAddress) {
        events.push({ kind: "burn", from, tokens, at, ref });
      } else {
        events.push({ kind: "transfer", from, to, tokens, at, ref });
      }
    }
    return events;
  }

  async totalSupply(tokenAddress: string): Promise<bigint> {
    const provider = new JsonRpcProvider(this.rpcUrl);
    const token = new Contract(tokenAddress, TOKEN_ABI, provider) as SupplyContract;
    return token.totalSupply();
  }
}
