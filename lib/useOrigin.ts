'use client';
import { useSyncExternalStore } from 'react';

/** The origin never changes for the life of a document, so nothing to subscribe to. */
const subscribe = () => () => {};

/**
 * `window.location.origin`, or `null` during the server render and hydration.
 *
 * Read through `useSyncExternalStore` for the same reason the room page reads
 * the session that way: copying it into state from an effect is exactly what
 * `react-hooks/set-state-in-effect` exists to prevent, and a bare
 * `typeof window !== 'undefined'` check during render makes the server and
 * client markup disagree. `null` means NOT KNOWN YET — render the placeholder.
 */
export function useOrigin(): string | null {
  return useSyncExternalStore(subscribe, () => window.location.origin, () => null);
}
