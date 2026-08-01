"use client";

import type { ReactNode } from "react";

export interface AllocationSegment {
  id: string;
  label: string;
  // Share in basis points (10 000 = 100%), as the API reports it.
  basisPoints: number;
  // Optional already-formatted amount shown beside the share.
  value?: ReactNode;
}

// A slice narrower than this is invisible and unhoverable, so it is widened to
// stay on screen. The LEGEND always states the true share — the bar is the
// impression, the legend is the fact.
const MIN_VISIBLE_PERCENT = 1;

const percent = (basisPoints: number): number => basisPoints / 100;

// 2.5: how a portfolio is split, as one bar plus a legend.
//
// Deliberately not a pie or donut: with a handful of holdings a single bar is
// easier to compare at a glance, needs no arc maths, and degrades to a plain
// list. The split is carried as TEXT in the legend, so it survives colour
// blindness, a screen reader, and a printed page.
export const AllocationBar = ({
  segments,
  emptyLabel,
}: {
  segments: readonly AllocationSegment[];
  emptyLabel: string;
}) => {
  if (segments.length === 0) {
    return <p className="muted">{emptyLabel}</p>;
  }

  return (
    <div className="allocation">
      <div className="allocation__bar" aria-hidden="true">
        {segments.map((segment, index) => (
          <span
            key={segment.id}
            data-testid={`allocation-${segment.id}`}
            className={`allocation__segment allocation__segment--${String((index % 5) + 1)}`}
            style={{
              width: `${String(Math.max(MIN_VISIBLE_PERCENT, percent(segment.basisPoints)))}%`,
            }}
          />
        ))}
      </div>
      <ul className="allocation__legend">
        {segments.map((segment, index) => (
          <li key={segment.id} className="allocation__item">
            <span
              className={`allocation__swatch allocation__segment--${String((index % 5) + 1)}`}
              aria-hidden="true"
            />
            <span className="allocation__label">{segment.label}</span>
            <span className="allocation__share num">
              {percent(segment.basisPoints).toFixed(1)}%
            </span>
            {segment.value !== undefined && (
              <span className="allocation__value num">{segment.value}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
};
