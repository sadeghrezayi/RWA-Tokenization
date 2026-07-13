import type { HealthProbe } from "./ports.js";

type ServiceState = "up" | "down";

export interface SystemHealthView {
  overall: "healthy" | "degraded";
  services: { api: ServiceState; postgres: ServiceState; ipfs: ServiceState; chain: ServiceState };
  chainBlockNumber?: number;
  pausedTokens: number;
}

export class GetSystemHealth {
  constructor(private readonly probe: HealthProbe) {}

  async execute(): Promise<SystemHealthView> {
    const [postgres, ipfs, chain, pausedTokens] = await Promise.all([
      this.probe.postgres(),
      this.probe.ipfs(),
      this.probe.chain(),
      this.probe.pausedTokenCount(),
    ]);

    const services = {
      api: "up" as const,
      postgres: state(postgres),
      ipfs: state(ipfs),
      chain: state(chain.reachable),
    };
    const degraded = Object.values(services).some((s) => s === "down");

    return {
      overall: degraded ? "degraded" : "healthy",
      services,
      ...(chain.reachable && chain.blockNumber !== undefined
        ? { chainBlockNumber: chain.blockNumber }
        : {}),
      pausedTokens,
    };
  }
}

const state = (up: boolean): ServiceState => (up ? "up" : "down");
