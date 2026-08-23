import type { Dictionary } from "../../lib/i18n";

export type Investor360TabId =
  "overview" | "compliance" | "investments" | "portfolio" | "cash" | "transfers" | "communications";

export interface Investor360Tab {
  id: Investor360TabId;
  label: (t: Dictionary) => string;
}

// 4.3 Investor 360.
//
// `information-architecture.md` names ten tabs: Overview · Identity &
// Compliance · Investments · Portfolio · Cash & Payments · Transfers ·
// Documents · Communications · Cases · Audit.
//
// These seven are the ones with something real behind them. The other three are
// deliberately ABSENT rather than empty, because the platform's rule is no dead
// nav — a tab is a claim that a capability exists:
//
//   Documents — a person's documents are their identity evidence, which already
//     lives in the compliance tab. A second tab would show the same files twice.
//   Cases     — compliance cases (`/ops/cases`) are not built at all.
//   Audit     — there is no per-investor audit trail. `asset_events` is
//     asset-scoped by design, so an Audit tab here would have nothing to read.
//
// Each becomes a tab when its feature does.
export const INVESTOR_360_TABS: Investor360Tab[] = [
  { id: "overview", label: (t) => t.tabOverview },
  { id: "compliance", label: (t) => t.tabCompliance },
  { id: "investments", label: (t) => t.tabInvestments },
  { id: "portfolio", label: (t) => t.tabPortfolio },
  { id: "cash", label: (t) => t.tabCash },
  { id: "transfers", label: (t) => t.tabTransfers },
  { id: "communications", label: (t) => t.tabCommunications },
];
