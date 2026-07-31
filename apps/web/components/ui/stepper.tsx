"use client";

export interface StepDescriptor {
  id: string;
  label: string;
}

export interface StepperProps {
  steps: readonly StepDescriptor[];
  current: string;
  completed: readonly string[];
  // Steps the reviewer sent back. These read as "needs changes" rather than
  // "done", even if they were completed in an earlier round.
  changesRequested?: readonly string[];
  onSelect: (id: string) => void;
}

// The wizard's spine. Rendered as a tablist because that is what it behaves
// like: one panel visible at a time, every step reachable. Screen readers get
// the state as TEXT ("done", "needs changes"), never only as a coloured tick.
export const Stepper = ({
  steps,
  current,
  completed,
  changesRequested = [],
  onSelect,
}: StepperProps) => (
  <ol className="stepper" role="tablist" aria-label="onboarding steps">
    {steps.map((step, index) => {
      const needsChanges = changesRequested.includes(step.id);
      const isDone = !needsChanges && completed.includes(step.id);
      const isCurrent = step.id === current;
      const state = needsChanges ? "changes" : isDone ? "done" : isCurrent ? "current" : "todo";
      return (
        <li key={step.id} className={`stepper__item stepper__item--${state}`}>
          <button
            type="button"
            role="tab"
            aria-selected={isCurrent}
            className="stepper__button"
            onClick={() => {
              onSelect(step.id);
            }}
          >
            <span className="stepper__index" aria-hidden="true">
              {isDone ? "✓" : index + 1}
            </span>
            <span className="stepper__label">{step.label}</span>
            {isDone && <span className="stepper__state">done</span>}
            {needsChanges && (
              <span className="stepper__state stepper__state--warn">needs changes</span>
            )}
          </button>
        </li>
      );
    })}
  </ol>
);
