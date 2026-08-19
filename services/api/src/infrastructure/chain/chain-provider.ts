import { JsonRpcProvider, Network } from "ethers";

// One definition of how this platform connects to its chain (K-30).
//
// `new JsonRpcProvider(url)` asks the node what network it is on, and when the
// node does not answer it retries that question every second FOREVER — one
// loop per provider, and this codebase builds a fresh provider per operation.
// Measured 2026-08-19 against a dead port: five providers left 11 background
// retries per three seconds, ten left 24, none of them ever stopping. The
// health probe builds two per call and the Overview screen calls it on mount,
// so the screen an operator refreshes during an outage compounded it until a
// rejection escaped as an uncaught exception and the API process exited.
//
// Telling the provider its network up front removes the question, so there is
// nothing to retry: a call against an unreachable node fails at the call site,
// which is where the caller can do something about it, and nothing is left
// running afterwards.
const DEFAULT_CHAIN_ID = 31337; // anvil's, and the devnet this platform ships against

export const chainId = (): number => {
  const configured = process.env.DEVNET_CHAIN_ID;
  if (configured === undefined || configured.trim() === "") return DEFAULT_CHAIN_ID;
  const parsed = Number(configured);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`DEVNET_CHAIN_ID must be a positive integer, not "${configured}"`);
  }
  return parsed;
};

export const chainProvider = (rpcUrl: string): JsonRpcProvider =>
  new JsonRpcProvider(rpcUrl, Network.from(chainId()), { staticNetwork: true });
