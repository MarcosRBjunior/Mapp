// Router state that marks a navigation as a country selection, so the map can reopen
// the popup of an already selected country (metric and period changes carry no state).
export function selectionState(): { selectedAt: number } {
  return { selectedAt: Date.now() };
}

export function selectionKeyOf(state: unknown): string {
  if (typeof state === 'object' && state !== null && 'selectedAt' in state) {
    return String(state.selectedAt);
  }
  return '';
}
