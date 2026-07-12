"use client";

import { useState } from "react";
import { truncateAddress } from "../../lib/format";

// P2: on-chain address as a compact, copyable chip — infrastructure, not the label.
export const Address = ({ value }: { value: string | undefined }) => {
  const [copied, setCopied] = useState(false);
  if (!value) return <span className="muted">—</span>;

  const copy = () => {
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
      }, 1200);
    });
  };

  return (
    <span className="addr" title={value}>
      <span>{truncateAddress(value)}</span>
      <button type="button" onClick={copy} aria-label="Copy address">
        {copied ? "✓" : "copy"}
      </button>
    </span>
  );
};

export const Progress = ({ value, max, label }: { value: number; max: number; label: string }) => {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="progress">
      <div className="progress__track">
        <div
          className="progress__fill"
          style={{ width: `${String(pct)}%` }}
          role="progressbar"
          aria-valuenow={value}
          aria-valuemax={max}
        />
      </div>
      <span className="progress__label">{label}</span>
    </div>
  );
};
