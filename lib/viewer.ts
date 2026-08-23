import { loadSession } from './session';

/**
 * Which kind of client is watching.
 *
 * 'player' is a person's own device: it has a session, a YOU ring, an answer
 * lock, and an RPC it is allowed to call. 'stage' is a TV or shared screen:
 * read-only, no session, no local player.
 */
export type ViewerRole = 'player' | 'stage';

/**
 * Who is watching, from the perspective of everything that draws.
 *
 * 'stage' returns null UNCONDITIONALLY — it does not fall through to the
 * session. That is the whole point of this module: a stage view opened on a
 * device that has already joined this room must behave exactly like one
 * opened on a device that has not, or the TV grows a YOU ring, biases callout
 * arbitration toward one player, and pins them in frame via framing.ts's
 * never-drop rule.
 *
 * Cheap and side-effect free, so callers may call it as often as they like —
 * but a per-frame caller should still throttle its MISSES the way
 * components/PixiStage.tsx does, because the 'player' path is a synchronous
 * localStorage read plus a JSON.parse.
 */
export function viewerPlayerId(role: ViewerRole, code: string): string | null {
  if (role === 'stage') return null;
  return loadSession(code)?.playerId ?? null;
}
