// A tiny declarative state machine (1.5). Aggregates declare their allowed
// transitions once as `from → to[]` and validate against it, instead of each
// hand-rolling per-action source-state guards. Framework-free; the aggregate
// supplies its own error via `onInvalid`, so domain error types are preserved.
export class StateMachine<S extends string> {
  private readonly transitions: ReadonlyMap<S, ReadonlySet<S>>;

  constructor(spec: Partial<Record<S, readonly S[]>>) {
    const map = new Map<S, ReadonlySet<S>>();
    for (const [from, targets] of Object.entries(spec) as [S, readonly S[]][]) {
      map.set(from, new Set(targets));
    }
    this.transitions = map;
  }

  canTransition(from: S, to: S): boolean {
    return this.transitions.get(from)?.has(to) ?? false;
  }

  allowedTargets(from: S): ReadonlySet<S> {
    return this.transitions.get(from) ?? new Set<S>();
  }

  assertCanTransition(from: S, to: S, onInvalid: (from: S, to: S) => never): void {
    if (!this.canTransition(from, to)) {
      onInvalid(from, to);
    }
  }
}
