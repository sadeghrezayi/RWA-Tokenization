import type { HealthProbe } from "./ports.js";

type ServiceState = "up" | "down";

export interface SystemHealthView {
  overall: "healthy" | "degraded";
  services: { api: ServiceState; postgres: ServiceState; ipfs: ServiceState; chain: ServiceState };
  chainBlockNumber?: number;
  pausedTokens: number;
  approvedWithoutOnchainIdentity: number;
}

export class GetSystemHealth {
  constructor(private readonly probe: HealthProbe) {}

  async execute(): Promise<SystemHealthView> {
    const [postgres, ipfs, chain, pausedTokens, approvedWithoutOnchainIdentity] = await Promise.all(
      [
        this.probe.postgres(),
        this.probe.ipfs(),
        this.probe.chain(),
        this.probe.pausedTokenCount(),
        this.probe.approvedWithoutOnchainIdentity(),
      ],
    );

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
      // Not part of `overall`: the platform is up, some work is owed. Flipping
      // health to "degraded" for a backlog would cry wolf during every outage
      // recovery, exactly when a real signal matters most.
      approvedWithoutOnchainIdentity,
    };
  }
}

const state = (up: boolean): ServiceState => (up ? "up" : "down");
