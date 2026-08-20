export interface RoomSession { roomId: string; playerId: string; playerKey: string; hostKey?: string; }

export function saveSession(code: string, s: RoomSession): void {
  localStorage.setItem(`cb:${code.toUpperCase()}`, JSON.stringify(s));
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
