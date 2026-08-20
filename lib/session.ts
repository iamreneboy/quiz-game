export interface RoomSession { roomId: string; playerId: string; playerKey: string; hostKey?: string; }

export function saveSession(code: string, s: RoomSession): void {
  localStorage.setItem(`cb:${code.toUpperCase()}`, JSON.stringify(s));
}
export function loadSession(code: string): RoomSession | null {
  const raw = localStorage.getItem(`cb:${code.toUpperCase()}`);
  return raw ? (JSON.parse(raw) as RoomSession) : null;
}
