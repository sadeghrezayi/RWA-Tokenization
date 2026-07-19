import { describe, expect, it } from "vitest";
import {
  HolderRegistry,
  type RegistryEvent,
} from "../../../src/domain/registry/holder-registry.js";
import {
  CorruptEventStreamError,
  InvalidRegistryEventError,
} from "../../../src/domain/registry/errors.js";

const T0 = new Date("2026-07-01T00:00:00Z");
const T1 = new Date("2026-07-02T00:00:00Z");
const T2 = new Date("2026-07-03T00:00:00Z");
const T3 = new Date("2026-07-04T00:00:00Z");

const mint = (to: string, tokens: bigint, at: Date, ref = "0xmint"): RegistryEvent => ({
  kind: "mint",
  to,
  tokens,
  at,
  ref,
});
const transfer = (
  from: string,
  to: string,
  tokens: bigint,
  at: Date,
  ref = "0xtransfer",
): RegistryEvent => ({ kind: "transfer", from, to, tokens, at, ref });
const burn = (from: string, tokens: bigint, at: Date, ref = "0xburn"): RegistryEvent => ({
  kind: "burn",
  from,
  tokens,
  at,
  ref,
});

describe("HolderRegistry.fromEvents (FR-RA-1 — reconstruct from chain)", () => {
  it("folds_mints_transfers_and_burns_into_current_balances", () => {
    const registry = HolderRegistry.fromEvents([
      mint("0xa", 60n, T0),
      mint("0xb", 40n, T0),
      transfer("0xa", "0xb", 15n, T1),
      burn("0xa", 10n, T2),
    ]);

    expect(registry.holders).toEqual([
      { holder: "0xb", tokens: 55n, since: T0 },
      { holder: "0xa", tokens: 35n, since: T0 },
    ]);
    expect(registry.totalTokens).toBe(90n);
  });

  it("orders_holders_by_descending_balance_then_holder_key", () => {
    const registry = HolderRegistry.fromEvents([
      mint("0xc", 20n, T0),
      mint("0xa", 50n, T0),
      mint("0xb", 20n, T0),
    ]);
    expect(registry.holders.map((h) => h.holder)).toEqual(["0xa", "0xb", "0xc"]);
  });

  it("drops_fully_exited_holders_but_keeps_them_in_history", () => {
    const registry = HolderRegistry.fromEvents([
      mint("0xa", 30n, T0),
      transfer("0xa", "0xb", 30n, T1),
    ]);

    expect(registry.holders).toEqual([{ holder: "0xb", tokens: 30n, since: T1 }]);
    expect(registry.history).toHaveLength(2);
    expect(registry.history[0]).toMatchObject({ kind: "mint", to: "0xa" });
  });

  it("since_restarts_when_a_holder_exits_and_reacquires", () => {
    const registry = HolderRegistry.fromEvents([
      mint("0xa", 30n, T0),
      transfer("0xa", "0xb", 30n, T1), // 0xa exits
      transfer("0xb", "0xa", 5n, T3), // 0xa re-enters — holding starts at T3
    ]);

    expect(registry.holders).toEqual([
      { holder: "0xb", tokens: 25n, since: T1 },
      { holder: "0xa", tokens: 5n, since: T3 },
    ]);
  });

  it("keeps_the_original_since_when_a_balance_only_grows_or_shrinks_above_zero", () => {
    const registry = HolderRegistry.fromEvents([
      mint("0xa", 30n, T0),
      mint("0xa", 10n, T1),
      burn("0xa", 39n, T2), // still holds 1
    ]);
    expect(registry.holders).toEqual([{ holder: "0xa", tokens: 1n, since: T0 }]);
  });

  it("treats_a_self_transfer_as_balance_neutral_history", () => {
    const registry = HolderRegistry.fromEvents([
      mint("0xa", 30n, T0),
      transfer("0xa", "0xa", 5n, T1),
    ]);
    expect(registry.holders).toEqual([{ holder: "0xa", tokens: 30n, since: T0 }]);
    expect(registry.history).toHaveLength(2);
  });

  it("is_empty_for_an_empty_stream", () => {
    const registry = HolderRegistry.fromEvents([]);
    expect(registry.holders).toEqual([]);
    expect(registry.totalTokens).toBe(0n);
    expect(registry.history).toEqual([]);
  });

  it("rejects_a_non_positive_event_amount", () => {
    expect(() => HolderRegistry.fromEvents([mint("0xa", 0n, T0)])).toThrow(
      InvalidRegistryEventError,
    );
    expect(() => HolderRegistry.fromEvents([mint("0xa", -5n, T0)])).toThrow(
      InvalidRegistryEventError,
    );
  });

  it("refuses_a_corrupt_stream_that_drives_a_balance_negative", () => {
    // A transfer out of a wallet that never received: the stream is incomplete
    // or out of order — a transfer-agent-grade registry must fail loudly, not
    // silently clamp (NFR-2).
    expect(() =>
      HolderRegistry.fromEvents([mint("0xa", 10n, T0), transfer("0xb", "0xc", 5n, T1)]),
    ).toThrow(CorruptEventStreamError);
    expect(() => HolderRegistry.fromEvents([burn("0xa", 1n, T0)])).toThrow(CorruptEventStreamError);
  });

  it("exposes_defensive_copies_not_internal_state", () => {
    const registry = HolderRegistry.fromEvents([mint("0xa", 10n, T0)]);
    registry.holders.pop();
    registry.history.pop();
    expect(registry.holders).toHaveLength(1);
    expect(registry.history).toHaveLength(1);
  });
});

describe("HolderRegistry.reconcile (registry vs on-chain supply, §14 step 8)", () => {
  it("matches_when_the_registry_total_equals_the_on_chain_supply", () => {
    const registry = HolderRegistry.fromEvents([mint("0xa", 60n, T0), burn("0xa", 10n, T1)]);
    expect(registry.reconcile(50n)).toEqual({
      matches: true,
      registryTotal: 50n,
      onChainSupply: 50n,
    });
  });

  it("reports_a_mismatch_without_hiding_the_numbers", () => {
    const registry = HolderRegistry.fromEvents([mint("0xa", 60n, T0)]);
    expect(registry.reconcile(55n)).toEqual({
      matches: false,
      registryTotal: 60n,
      onChainSupply: 55n,
    });
  });
});
