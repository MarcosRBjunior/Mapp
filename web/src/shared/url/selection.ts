// Router state that marks a navigation as a country selection, so the map can reopen
// the popup of an already selected country (metric and period changes carry no state).
// A counter, not the clock: two selections in the same millisecond must still get different keys.
let lastSelection = 0;

export function selectionState(): { selectedAt: number } {
  lastSelection += 1;
  return { selectedAt: lastSelection };
}

export function selectionKeyOf(state: unknown): string {
  if (typeof state === 'object' && state !== null && 'selectedAt' in state) {
    return String(state.selectedAt);
  }
  return '';
}
