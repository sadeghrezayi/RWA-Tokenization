import type { ReactNode } from "react";

export type BadgeTone = "neutral" | "success" | "warning" | "danger" | "info";

export const Badge = ({ tone, children }: { tone: BadgeTone; children: ReactNode }) => (
  <span className={`badge badge--${tone}`}>{children}</span>
);
