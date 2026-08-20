let offsetMs = 0;

export function noteServerTime(serverNowIso: string): void {
  offsetMs = new Date(serverNowIso).getTime() - Date.now();
}
export function serverNow(): number {
  return Date.now() + offsetMs;
}
export function msUntil(endsAtIso: string | null): number {
  if (!endsAtIso) return 0;
  return Math.max(0, new Date(endsAtIso).getTime() - serverNow());
}
