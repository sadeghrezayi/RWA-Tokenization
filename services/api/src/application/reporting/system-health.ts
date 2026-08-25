import type { HealthProbe } from "./ports.js";

type ServiceState = "up" | "down";

export interface SystemHealthView {
  overall: "healthy" | "degraded";
  services: { api: ServiceState; postgres: ServiceState; ipfs: ServiceState; chain: ServiceState };
  chainBlockNumber?: number;
  pausedTokens: number;
  approvedWithoutOnchainIdentity: number;
  // heldRial is a STRING: it crosses HTTP as JSON, which has no bigint, and a
  // Number() would silently drop the low digits of a large escrow.
  allocationsAwaitingMint: { count: number; heldRial: string };
}

export class GetSystemHealth {
  constructor(private readonly probe: HealthProbe) {}

  async execute(): Promise<SystemHealthView> {
    const [postgres, ipfs, chain, pausedTokens, approvedWithoutOnchainIdentity, awaitingMint] =
      await Promise.all([
        this.probe.postgres(),
        this.probe.ipfs(),
        this.probe.chain(),
        this.probe.pausedTokenCount(),
        this.probe.approvedWithoutOnchainIdentity(),
        this.probe.allocationsAwaitingMint(),
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
      // Not part of `overall`: the platform is up, some work is owed. Flipping
      // health to "degraded" for a backlog would cry wolf during every outage
      // recovery, exactly when a real signal matters most.
      approvedWithoutOnchainIdentity,
      // Same reasoning as the count above: owed work is not an outage.
      allocationsAwaitingMint: {
        count: awaitingMint.count,
        heldRial: String(awaitingMint.heldRial),
      },
    };
  }
}

const state = (up: boolean): ServiceState => (up ? "up" : "down");
