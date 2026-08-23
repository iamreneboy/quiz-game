'use client';
import { useEffect } from 'react';
import { startCueBridge } from './presentation/cueBus';
import { startStagingRuntime } from './staging/runtime';
import { startAudioRuntime } from './audio/runtime';
import { startCeremonyRuntime } from './ceremony/runtime';
import type { ViewerRole } from './viewer';

/**
 * Mounts the four presentation runtimes for a room, in the one order that
 * works. Shared by the player route and the stage route.
 *
 * THE ORDER IS LOAD-BEARING. `startCueBridge` seeds synchronously from the
 * store on mount, so any subscriber registered AFTER it misses the entire seed
 * batch on a client-side navigation into a room already in the store — which
 * is why the audio runtime goes first. It lived as a comment in one route
 * until P6a added a second; a comment cannot survive being copied.
 */
export function useRoomRuntimes(code: string, role: ViewerRole): void {
  useEffect(() => startAudioRuntime(), []);
  useEffect(() => startCueBridge(), []);
  useEffect(() => startStagingRuntime(code, role), [code, role]);
  useEffect(() => startCeremonyRuntime(), []);
}
