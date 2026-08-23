export interface RoomSession { roomId: string; playerId: string; playerKey: string; hostKey?: string; }

/**
 * Sessions live in localStorage, which React cannot see. `subscribeSession`
 * makes them a real external store so a component can read one through
 * `useSyncExternalStore` instead of copying it into state from an effect —
 * the pattern the `react-hooks/set-state-in-effect` rule exists to prevent.
 *
 * `saveSession` is the only writer in the app (JoinGate, host/new), so
 * notifying here is enough; nothing has to remember to announce itself.
 */
const listeners = new Set<() => void>();

export function subscribeSession(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => { listeners.delete(onChange); };
}

export function saveSession(code: string, s: RoomSession): void {
  localStorage.setItem(`cb:${code.toUpperCase()}`, JSON.stringify(s));
  for (const l of listeners) l();
}
export function loadSession(code: string): RoomSession | null {
  const raw = localStorage.getItem(`cb:${code.toUpperCase()}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as RoomSession;
  } catch {
    return null;
  }
}
