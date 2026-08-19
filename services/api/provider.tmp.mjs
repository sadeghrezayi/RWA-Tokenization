import { JsonRpcProvider, Network } from "ethers";

process.on("unhandledRejection", (reason) => {
  console.log("UNHANDLED REJECTION:", reason instanceof Error ? reason.message : reason);
  process.exitCode = 9;
});

const dead = "http://127.0.0.1:9";

// 1. How the codebase builds providers today.
console.log("--- plain JsonRpcProvider ---");
try {
  const provider = new JsonRpcProvider(dead);
  await provider.getBlockNumber();
} catch (error) {
  console.log("caught at the call site:", error.shortMessage ?? error.message);
}

await new Promise((r) => setTimeout(r, 1500));

// 2. With the network stated up front, so nothing probes in the background.
console.log("--- staticNetwork JsonRpcProvider ---");
try {
  const provider = new JsonRpcProvider(dead, Network.from(31337), { staticNetwork: true });
  await provider.getBlockNumber();
} catch (error) {
  console.log("caught at the call site:", error.shortMessage ?? error.message);
}

await new Promise((r) => setTimeout(r, 1500));
console.log("survived to the end");
