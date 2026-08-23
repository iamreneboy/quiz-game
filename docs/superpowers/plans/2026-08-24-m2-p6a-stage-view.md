# M2 P6a — Stage view: spectator route & broadcast shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only `/stage/[code]` route — a chrome-free broadcast screen for a TV or shared screen that follows a live game from lobby through ceremony with no interaction, composed entirely from P1–P5's existing world, staging, audio and ceremony.

**Architecture:** One pure module (`lib/viewer.ts`) turns "which kind of client is this" into a local-player id, and every place that used to read `localStorage` directly reads it instead — so a stage client is a *player-less* client by construction rather than by accident. One hook (`lib/useRoomRuntimes.ts`) owns the load-bearing runtime mount order for both routes. The stage route then composes existing presentational components at TV scale over a full-bleed canvas. No new store, no new cue type, no wire change, no RPC.

**Tech Stack:** Next.js 16 (App Router) · React 19 · TypeScript · PixiJS v8 · `motion` v13 · Howler · Zustand · Tailwind v4 · Vitest · Playwright · `qrcode` (new)

**Spec:** `docs/superpowers/specs/2026-08-24-m2-p6a-stage-view-design.md`

## Global Constraints

- **NEVER run `supabase stop` or `supabase start`.** Windows/Hyper-V reserves TCP 54024–54423, which covers every default Supabase port. The running stack is bound to shifted ports recorded in the gitignored `.env.local`; a restart binds the reserved defaults, fails, and loses the working stack. In a fresh git worktree, `.env.local` must be copied by hand from the main checkout before `npm run dev` can reach the database.
- **No wire change in this phase.** `lib/types.ts` is not modified, no migration is added, and no RPC is created or altered. The only broadcasts are `phase` and `player_joined`, and neither carries answer progress — so the stage view shows **no** "locked in" count during ANSWER (spec decision 3).
- **The stage client never writes.** No `supabase.rpc(...)` call that mutates, ever — not `useHostDriver`, not `submit_answer`, not `join_room`. Enforced by composition: the stage route mounts none of the components that can write (spec decision 2).
- **Never put an opacity or transform Tailwind class on an element whose `motion` `variants` animate the same property.** Inline animated styles outrank the class regardless of specificity (ADR-0017). This project has already shipped that bug once.
- **A component that conditionally mounts off staging/ceremony state needs `AnimatePresence initial={false}`; one that mounts unconditionally needs a one-shot mount-time derivation instead** (ADR-0014, ADR-0030). This trap has been found four times. Check for it by default.
- **Rendering separation.** Pixi owns the world; HTML/React owns everything readable and interactive. Accessibility never depends on canvas (PRD §9).
- **Option identity is fixed BY INDEX, never by content** — ▲ is always cyan, ◆ magenta, ● lime, ■ warning, across every question in every round and on every surface.
- **The stage view targets landscape ≥1024px.** It renders below that and is not designed for it. A portrait stage layout is a non-goal.
- **Run the e2e suite as `npm run test:e2e -- --workers=2`.** The default worker count is flaky under load on this machine.
- **Unit tests are `npm test` (Vitest).** `vitest.config.ts` runs in the Node environment with no jsdom and no React Testing Library — there is no component-test seam in this repo. Components are verified through Playwright and a headed manual pass; only pure modules get unit tests.
- **`npm run lint` is clean as of 2026-08-24.** There is no longer a pre-existing error to discount. Any lint error you see is yours.
- **Headless Chromium cannot measure frame budget.** It falls back to SwiftShader and pins the VFX budget at `minimal`. Any visual/performance check runs in a **headed** browser.

---

### Task 1: Per-owner texture cache

`lib/world/render/AvatarNode.ts` holds baked avatar textures in a module-scope `Map<string, Texture>`, and `Avatars.destroy()` calls `clearBakedAvatars()` — which destroys **every** texture in the table, not just its own renderer's. That is safe with exactly one Pixi `Application` and unsafe the moment there are two, which is what this phase introduces. The failure is reachable without two canvases on screen at once: a client-side navigation from `/room/CODE` to `/stage/CODE` keeps the module alive across the route change, so a cache entry can outlive the renderer that generated it and be handed to a sprite in a different one.

`docs/progress/CURRENT.md` flags this "fix before P6", which is why it is task 1.

The cache is split into a pure, owner-partitioned memo table so it can be tested in Node without importing Pixi at all.

**Files:**

- Create: `lib/world/render/ownedCache.ts`
- Create: `tests/ownedCache.test.ts`
- Modify: `lib/world/render/AvatarNode.ts` (the `textures` map, `bake`, `clearBakedAvatars`)
- Modify: `lib/world/render/Avatars.ts:115` (the `clearBakedAvatars()` call in `destroy`)

**Interfaces:**

- Consumes: nothing. `ownedCache.ts` imports no Pixi, no React, no DOM.
- Produces:
  - `class OwnedCache<Owner extends object, Value>`
  - `get(owner: Owner, key: string, create: () => Value): Value`
  - `size(owner: Owner): number`
  - `clear(owner: Owner, dispose: (value: Value) => void): void`
  - `clearBakedAvatars(app: Application): void` — **signature change**, was zero-argument.

- [ ] **Step 1: Write the failing test**

Create `tests/ownedCache.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { OwnedCache } from '@/lib/world/render/ownedCache';

/** Stand-ins for two Pixi Applications. Any two distinct objects will do. */
const appA = { name: 'a' };
const appB = { name: 'b' };

describe('OwnedCache', () => {
  it('creates a value once per owner and reuses it', () => {
    const cache = new OwnedCache<object, string>();
    const create = vi.fn(() => 'duck-texture');

    expect(cache.get(appA, 'duck', create)).toBe('duck-texture');
    expect(cache.get(appA, 'duck', create)).toBe('duck-texture');
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('does NOT share a value between owners', () => {
    const cache = new OwnedCache<object, string>();
    let n = 0;
    const create = () => `duck-${++n}`;

    // This is the whole point: the same key under a different owner must bake
    // again, because the value belongs to the renderer that produced it.
    expect(cache.get(appA, 'duck', create)).toBe('duck-1');
    expect(cache.get(appB, 'duck', create)).toBe('duck-2');
    expect(cache.get(appA, 'duck', create)).toBe('duck-1');
  });

  it('clears one owner without disposing another owner’s values', () => {
    const cache = new OwnedCache<object, string>();
    cache.get(appA, 'duck', () => 'a-duck');
    cache.get(appB, 'duck', () => 'b-duck');

    const dispose = vi.fn();
    cache.clear(appA, dispose);

    expect(dispose).toHaveBeenCalledExactlyOnceWith('a-duck');
    expect(cache.size(appA)).toBe(0);
    expect(cache.size(appB)).toBe(1);
  });

  it('re-creates after a clear rather than serving a disposed value', () => {
    const cache = new OwnedCache<object, string>();
    cache.get(appA, 'duck', () => 'first');
    cache.clear(appA, () => {});

    expect(cache.get(appA, 'duck', () => 'second')).toBe('second');
  });

  it('clearing an owner it has never seen is a no-op', () => {
    const cache = new OwnedCache<object, string>();
    const dispose = vi.fn();

    expect(() => cache.clear(appA, dispose)).not.toThrow();
    expect(dispose).not.toHaveBeenCalled();
  });

  it('reports size 0 for an unknown owner', () => {
    expect(new OwnedCache<object, string>().size(appA)).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/ownedCache.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/world/render/ownedCache"`.

- [ ] **Step 3: Write the implementation**

Create `lib/world/render/ownedCache.ts`:

```ts
/**
 * A memo table partitioned by the object that OWNS the values.
 *
 * Baked Pixi textures belong to the renderer that generated them: hand one to
 * a sprite in a different `Application` and it is bound to a GPU context that
 * no longer exists, and destroying the first renderer takes the texture out
 * from under the second. A single module-scope Map cannot express that
 * ownership; this can.
 *
 * Partitions are held weakly, so an owner that is destroyed and forgotten
 * without anyone calling `clear` still becomes collectable.
 *
 * Deliberately generic and Pixi-free: it is the tested half of the avatar
 * texture cache, and canvas internals are not unit-tested (roadmap §5).
 */
export class OwnedCache<Owner extends object, Value> {
  private readonly partitions = new WeakMap<Owner, Map<string, Value>>();

  /** The value for `key` under `owner`, creating it on first ask. */
  get(owner: Owner, key: string, create: () => Value): Value {
    let partition = this.partitions.get(owner);
    if (!partition) {
      partition = new Map<string, Value>();
      this.partitions.set(owner, partition);
    }
    const cached = partition.get(key);
    if (cached !== undefined) return cached;

    const value = create();
    partition.set(key, value);
    return value;
  }

  /** Live entries for one owner. Tests and diagnostics only. */
  size(owner: Owner): number {
    return this.partitions.get(owner)?.size ?? 0;
  }

  /**
   * Dispose one owner's entries and drop its partition. Every other owner is
   * untouched — which is the difference between this and the module-scope Map
   * it replaces.
   */
  clear(owner: Owner, dispose: (value: Value) => void): void {
    const partition = this.partitions.get(owner);
    if (!partition) return;
    for (const value of partition.values()) dispose(value);
    partition.clear();
    this.partitions.delete(owner);
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- tests/ownedCache.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Namespace the avatar cache**

In `lib/world/render/AvatarNode.ts`, replace the module-scope map and both functions that use it.

Add the import next to the existing relative imports:

```ts
import { OwnedCache } from './ownedCache';
```

Replace:

```ts
/** Baked once per character key, shared by every player using it. */
const textures = new Map<string, Texture>();

function bake(app: Application, spec: AvatarSpec): Texture {
  const cached = textures.get(spec.key);
  if (cached) return cached;

  const g = new Graphics();
  spec.draw(g, { width: AVATAR_HEIGHT, height: AVATAR_HEIGHT, color: COLOR });
  const texture = app.renderer.generateTexture({ target: g });
  g.destroy();
  textures.set(spec.key, texture);
  return texture;
}

/** Drop every baked texture. Call only when the renderer is torn down. */
export function clearBakedAvatars(): void {
  for (const texture of textures.values()) texture.destroy(true);
  textures.clear();
}
```

with:

```ts
/**
 * Baked once per character key PER RENDERER, shared by every player using it.
 *
 * Keyed by `Application`, not globally: P6a adds a second renderer (the stage
 * view), and a texture generated by one renderer must never be handed to a
 * sprite in another — nor destroyed by the other's teardown. The failure does
 * not need two canvases on screen at once; a client-side navigation between
 * the two routes keeps this module alive across the change.
 */
const textures = new OwnedCache<Application, Texture>();

function bake(app: Application, spec: AvatarSpec): Texture {
  return textures.get(app, spec.key, () => {
    const g = new Graphics();
    spec.draw(g, { width: AVATAR_HEIGHT, height: AVATAR_HEIGHT, color: COLOR });
    const texture = app.renderer.generateTexture({ target: g });
    g.destroy();
    return texture;
  });
}

/** Drop one renderer's baked textures. Call only when THAT renderer is torn down. */
export function clearBakedAvatars(app: Application): void {
  textures.clear(app, texture => texture.destroy(true));
}
```

- [ ] **Step 6: Pass the application through at the call site**

In `lib/world/render/Avatars.ts`, in `destroy()`, change:

```ts
    clearBakedAvatars();
```

to:

```ts
    clearBakedAvatars(this.app);
```

`this.app` is already a constructor property on `Avatars` (`lib/world/render/Avatars.ts:33`), so no signature changes.

- [ ] **Step 7: Verify types, lint and the full unit suite**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: tsc silent, lint zero problems, all tests pass. `tsc` is the real check here — it is what catches any other caller of the now-one-argument `clearBakedAvatars`.

- [ ] **Step 8: Commit**

```bash
git add lib/world/render/ownedCache.ts tests/ownedCache.test.ts lib/world/render/AvatarNode.ts lib/world/render/Avatars.ts
git commit -m "fix: namespace the baked avatar texture cache per Pixi Application"
```

---

### Task 2: The viewer seam

Four call sites resolve "who is watching" by reading `localStorage` directly. A stage client must resolve `null` at all four **regardless of what is in storage for that room code** — because the likeliest real setup is the host opening the TV link on the same laptop they joined from (spec decision 1).

This task also lifts the room page's four runtime `useEffect`s into a hook. Their order is load-bearing and documented only in a comment; duplicating it into a second route is how that comment stops being true.

No behaviour changes for the player route. The existing e2e suite is the proof.

**Files:**

- Create: `lib/viewer.ts`
- Create: `lib/useRoomRuntimes.ts`
- Create: `tests/viewer.test.ts`
- Modify: `lib/staging/runtime.ts` (`startStagingRuntime` signature; `isLocalPlayerPlaying`; the `phase-track` callout resolution)
- Modify: `components/PixiStage.tsx` (`role` prop; `readLocalPlayerId`; the band policy)
- Modify: `app/room/[code]/page.tsx` (drop the four effects, call the hook, pass `role="player"`)

**Interfaces:**

- Consumes: `loadSession` from `lib/session.ts`.
- Produces:
  - `type ViewerRole = 'player' | 'stage'`
  - `viewerPlayerId(role: ViewerRole, code: string): string | null`
  - `useRoomRuntimes(code: string, role: ViewerRole): void`
  - `startStagingRuntime(code: string, role: ViewerRole): () => void` — **signature change**, `role` is required.
  - `PixiStage` props become `{ code: string; role: ViewerRole }` — **`role` is required**, so every call site is a type error until updated.

- [ ] **Step 1: Write the failing test**

Create `tests/viewer.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { viewerPlayerId } from '@/lib/viewer';

/**
 * Minimal in-memory Storage installed as the bare `localStorage` global —
 * lib/session.ts calls `localStorage.getItem` directly, not `window.localStorage`.
 */
function installStorage(): Storage {
  const data = new Map<string, string>();
  const storage: Storage = {
    get length() { return data.size; },
    clear: () => data.clear(),
    getItem: (k: string) => data.get(k) ?? null,
    key: (i: number) => [...data.keys()][i] ?? null,
    removeItem: (k: string) => void data.delete(k),
    setItem: (k: string, v: string) => void data.set(k, v),
  };
  vi.stubGlobal('localStorage', storage);
  return storage;
}

const SESSION = JSON.stringify({
  roomId: 'r1', playerId: 'p1', playerKey: 'k1', hostKey: 'h1',
});

let storage: Storage;
beforeEach(() => { storage = installStorage(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('viewerPlayerId', () => {
  it('gives a player their own id', () => {
    storage.setItem('cb:ABCDE', SESSION);
    expect(viewerPlayerId('player', 'ABCDE')).toBe('p1');
  });

  it('gives a player null when they have not joined', () => {
    expect(viewerPlayerId('player', 'ABCDE')).toBeNull();
  });

  it('gives the STAGE null even when a session for that exact room exists', () => {
    // The load-bearing case: the host opens the TV link on the laptop they
    // are playing on. A stage view must not become a player view.
    storage.setItem('cb:ABCDE', SESSION);
    expect(viewerPlayerId('stage', 'ABCDE')).toBeNull();
  });

  it('gives the stage null with no session at all', () => {
    expect(viewerPlayerId('stage', 'ABCDE')).toBeNull();
  });

  it('does not consult storage at all for the stage', () => {
    const getItem = vi.spyOn(storage, 'getItem');
    viewerPlayerId('stage', 'ABCDE');
    expect(getItem).not.toHaveBeenCalled();
  });

  it('is case-insensitive on the room code for a player', () => {
    storage.setItem('cb:ABCDE', SESSION);
    expect(viewerPlayerId('player', 'abcde')).toBe('p1');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/viewer.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/viewer"`.

- [ ] **Step 3: Write the implementation**

Create `lib/viewer.ts`:

```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- tests/viewer.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Thread the role through the staging runtime**

In `lib/staging/runtime.ts`:

Add the import:

```ts
import { viewerPlayerId, type ViewerRole } from '@/lib/viewer';
```

Change the signature:

```ts
export function startStagingRuntime(code: string, role: ViewerRole): () => void {
```

Replace `isLocalPlayerPlaying` (which currently calls `loadSession(code)?.playerId`):

```ts
  // Resolved lazily: a PLAYER's session is written when they join, which can
  // happen after this runtime starts. Cheap to repeat — it only runs on a
  // store change, not per frame. On the stage this never touches storage
  // (lib/viewer.ts) and always reports "playing", which is correct: the
  // tension vignette should ramp for the whole room.
  const isLocalPlayerPlaying = (): boolean => {
    const { players } = useGameStore.getState();
    const playerId = viewerPlayerId(role, code);
    if (!playerId) return true; // not joined yet, or a stage view: nothing to disable
    const me = players.find(p => p.id === playerId);
    return me ? me.is_playing : true;
  };
```

Replace the `phase-track` handler's session read:

```ts
    on('phase-track', () => {
      callouts = resolveCallout(callouts, nameOf, viewerPlayerId(role, code));
      publishCallouts();
    }),
```

`lib/session.ts`'s `loadSession` import in this file is now unused — remove it, or `npm run lint` will flag it.

- [ ] **Step 6: Thread the role through PixiStage**

In `components/PixiStage.tsx`:

Replace the `loadSession` import with:

```ts
import { viewerPlayerId, type ViewerRole } from '@/lib/viewer';
```

Change the signature and the band policy:

```ts
export default function PixiStage({ code, role }: { code: string; role: ViewerRole }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const hydrated = useSettings(s => s.hydrated);
  const profile = useSettings(s => s.profile);
  const phase = useGameStore(s => s.room?.phase ?? 'lobby');
  const board = useCeremony(s => s.steps.board);
  /**
   * The strip is a PLAYER-view compromise: on a phone the question has to
   * dominate, so the world gives up all but 28vh. The stage view inverts it —
   * the world is full bleed at every phase and the question overlays it. That
   * inversion is the cinematic difference between the two surfaces (spec
   * decision 4). The results band is shared: the podium holds 100vh and
   * retreats to 50vh when the board lands, on both surfaces.
   */
  const band =
    phase === 'results' ? 'podium'
      : role === 'player' && STRIP_PHASES.has(phase) ? 'strip'
        : 'full';
```

Change `readLocalPlayerId` to route through the seam:

```ts
    let localPlayerId: string | null = null;
    let nextSessionRead = 0;
    const readLocalPlayerId = () => {
      // A stage view has no local player and never consults storage, so the
      // throttle below has nothing to protect.
      if (role === 'stage') return null;
      if (localPlayerId !== null) return localPlayerId;
      const now = performance.now();
      if (now < nextSessionRead) return null;
      nextSessionRead = now + SESSION_RECHECK_MS;
      localPlayerId = viewerPlayerId(role, code);
      return localPlayerId;
    };
```

Add `role` to the effect's dependency array: `}, [hydrated, profile, code, role]);`

- [ ] **Step 7: Write the runtime hook**

Create `lib/useRoomRuntimes.ts`:

```ts
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
```

- [ ] **Step 8: Adopt the hook in the room route**

In `app/room/[code]/page.tsx`:

Delete these four lines and the comment block above them:

```ts
  // MOUNTED FIRST, deliberately: startCueBridge seeds synchronously from the
  // store on mount, so a subscriber registered after it would miss the whole
  // seed batch on a client-side navigation into a room already in the store.
  useEffect(() => startAudioRuntime(), []);
  useEffect(() => startCueBridge(), []);
  useEffect(() => startStagingRuntime(code), [code]);
  useEffect(() => startCeremonyRuntime(), []);
```

Replace with:

```ts
  useRoomRuntimes(code, 'player');
```

Update the imports: drop `startCueBridge`, `startStagingRuntime`, `startAudioRuntime`, `startCeremonyRuntime` and the now-unused `useEffect`; add:

```ts
import { useRoomRuntimes } from '@/lib/useRoomRuntimes';
```

And pass the role to the canvas:

```tsx
      {room && <PixiStage code={code} role="player" />}
```

- [ ] **Step 9: Verify types, lint and units**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: tsc silent, lint zero problems, all tests pass.

- [ ] **Step 10: Verify the player route is unchanged**

Run: `npm run test:e2e -- --workers=2`
Expected: all existing tests pass. This task is a pure refactor of the player route — any failure here is a regression, not a flake. If a test fails, re-run it alone before assuming it is real.

- [ ] **Step 11: Commit**

```bash
git add lib/viewer.ts lib/useRoomRuntimes.ts tests/viewer.test.ts lib/staging/runtime.ts components/PixiStage.tsx "app/room/[code]/page.tsx"
git commit -m "refactor: make the viewer role explicit and share the runtime mount order"
```

---

### Task 3: The stage route, the gate and the broadcast shell

The route itself: it subscribes, it runs the runtimes as a stage client, it holds the canvas full bleed, and it puts one tap in front of the show so Howler can unlock. The shell's regions are wired to the beat; their contents arrive in tasks 5–7.

`useRoomChannel` swallows a `get_room_state` error today, so an unknown code leaves `room` null forever and the page would read "Connecting…" indefinitely. Spec §10.1 requires a real not-found state, so the channel hook records the condition in the game store. The **room** route deliberately keeps its existing behaviour — adopting the flag there is a separate improvement, out of this phase's scope.

**Files:**

- Create: `app/stage/[code]/page.tsx`
- Create: `components/stage/StageGate.tsx`
- Create: `components/stage/StageBroadcast.tsx`
- Modify: `lib/store.ts` (add `roomMissing` + `setRoomMissing`)
- Modify: `lib/useRoomChannel.ts` (set the flag from the existing error branch)

**Interfaces:**

- Consumes: `useRoomRuntimes(code, 'stage')` and `PixiStage`'s `role` prop from Task 2.
- Produces:
  - `useGameStore`'s `roomMissing: boolean` and `setRoomMissing(missing: boolean): void`
  - `<StageGate code={code} />`
  - `<StageBroadcast code={code} />` — renders the three regions; region contents are filled by Tasks 5–7.
  - DOM hooks the e2e suite keys on: `data-testid="stage-gate"`, `data-testid="stage-broadcast"` carrying `data-beat`, `data-testid="stage-band"`.

- [ ] **Step 1: Add the not-found flag to the store**

In `lib/store.ts`, add to the state interface, alongside the existing fields:

```ts
  /**
   * True once `get_room_state` has told us this code does not exist. Set by
   * lib/useRoomChannel.ts, read by the stage route — a TV shows a typo as a
   * typo rather than an eternal "Connecting…".
   */
  roomMissing: boolean;
  setRoomMissing(missing: boolean): void;
```

and to the store body:

```ts
  roomMissing: false,
  setRoomMissing(missing) {
    set(state => (state.roomMissing === missing ? state : { roomMissing: missing }));
  },
```

- [ ] **Step 2: Set the flag from the channel hook**

In `lib/useRoomChannel.ts`, add the selector alongside the existing ones:

```ts
  const setRoomMissing = useGameStore(s => s.setRoomMissing);
```

and replace the subscribe callback's state fetch:

```ts
    ch.subscribe(async status => {
      if (status === 'SUBSCRIBED') {
        const { data, error } = await supabase.rpc('get_room_state', { p_code: code });
        if (!error && data) applyState(data as RoomState);
        setRoomMissing(!!error);
        ready = true;
```

Add `setRoomMissing` to the effect's dependency array.

- [ ] **Step 3: Write the gate**

Create `components/stage/StageGate.tsx`:

```tsx
'use client';
import { useState } from 'react';

/**
 * The one tap a broadcast screen gets (spec decision 6).
 *
 * Browsers refuse to start audio until a user gesture, and a chrome-free TV
 * screen never receives one — so without this the whole show is silent. It
 * needs NO audio API: lib/audio/runtime.ts already registers
 * `document.addEventListener('pointerdown', unlock, { once: true })`, so any
 * tap satisfies the policy on its way past.
 *
 * Opaque, and covers the show until tapped. That is deliberate: a screen with
 * no sound and no explanation is a worse failure than one asking to be
 * started. The runtimes mount and run behind it regardless, so dismissing it
 * at round 4 lands at round 4's true position rather than replaying from the
 * top — every beat's position comes from the server's `ends_at` (ADR-0014),
 * never from how long a component has been mounted.
 */
export default function StageGate({ code }: { code: string }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <button
      type="button"
      data-testid="stage-gate"
      onClick={() => setDismissed(true)}
      className="fixed inset-0 z-50 grid w-full place-items-center bg-void/95 backdrop-blur-sm
        focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-neon-cyan"
    >
      <span className="flex flex-col items-center gap-6">
        <span className="font-display text-[0.6875rem] font-semibold uppercase tracking-[0.28em] text-neon-cyan">
          Circuit Break Broadcast
        </span>
        <span className="font-display text-display font-black tracking-[0.2em] text-ink">
          {code}
        </span>
        <span className="font-display text-hero font-black uppercase tracking-[0.14em] text-warning">
          Tap to start the show
        </span>
        <span className="text-sm text-ink-mute">Sound starts with your first tap.</span>
      </span>
    </button>
  );
}
```

- [ ] **Step 4: Write the broadcast shell**

Create `components/stage/StageBroadcast.tsx`. Regions only in this task; Tasks 5–7 fill the slots marked with a comment.

```tsx
'use client';
import { useEffect, useState } from 'react';
import { useGameStore } from '@/lib/store';
import { useStaging } from '@/lib/staging/useStaging';
import { msUntil } from '@/lib/serverTime';
import { CATEGORIES, TIER_NAMES } from '@/lib/rank';
import LowerThird from '@/components/LowerThird';
import TimerRing from '@/components/TimerRing';

/**
 * The broadcast shell (spec §6) — the stage view's answer to StageShell.
 *
 * A separate file rather than a variant of StageShell, whose whole job is a
 * portrait-first grid that reserves the player view's 28vh canvas strip. Here
 * the canvas is full bleed at every phase and these regions sit OVER it:
 * a status bar along the top, the broadcast band across the lower third, and
 * the lower-third callout slot beneath it.
 *
 * `data-beat` is the stable hook the e2e suite keys on — assert on it, never
 * on copy.
 */
export default function StageBroadcast() {
  const beat = useStaging(s => s.beat);
  const room = useGameStore(s => s.room);
  const question = useGameStore(s => s.question);
  const cat = question ? CATEGORIES.find(c => c.key === question.category) : undefined;

  return (
    <div
      data-testid="stage-broadcast"
      data-beat={beat}
      className="pointer-events-none fixed inset-0 z-10 flex flex-col justify-between p-8"
    >
      <header className="flex items-start justify-between gap-6">
        <div className="flex items-center gap-3 font-display text-sm font-bold uppercase tracking-[0.14em]">
          {room && room.status !== 'lobby' && (
            <span className="text-ink-mute tabular-nums">
              Round {room.round}/{room.total_rounds}
            </span>
          )}
          {cat && (
            <span className="rounded-full border border-white/10 bg-haze/45 px-3 py-1.5 text-ink-dim">
              {cat.emoji} {cat.label}
            </span>
          )}
          {question && (
            <span className="rounded-full border border-warning/35 bg-warning/10 px-3 py-1.5 text-warning">
              {TIER_NAMES[question.tier]}
            </span>
          )}
        </div>
        {beat === 'answer' && <TimerRing />}
      </header>

      <div data-testid="stage-band" className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        {beat === 'countdown' && <StageCountdown endsAt={room?.ends_at ?? null} />}
        {/* Task 5 fills read / answer / reveal. Task 6 fills lobby. Task 7 fills track / results. */}
        <LowerThird />
      </div>
    </div>
  );
}

/**
 * The countdown at TV scale. Same one-interval shape as GameView's Countdown
 * (components/GameView.tsx) — the numeral comes from the server deadline, so
 * a stage view that opens mid-countdown joins it rather than restarting it.
 */
function StageCountdown({ endsAt }: { endsAt: string | null }) {
  const [n, setN] = useState(3);
  useEffect(() => {
    const id = setInterval(() => setN(Math.max(1, Math.ceil(msUntil(endsAt) / 1000))), 100);
    return () => clearInterval(id);
  }, [endsAt]);
  return (
    <p
      className="text-center font-display text-display font-black text-neon-cyan tabular-nums"
      style={{ textShadow: '0 0 60px color-mix(in oklab, var(--color-neon-cyan) 55%, transparent)' }}
    >
      {n}
    </p>
  );
}
```

The component takes **no props** in this task. It grows a `code` prop in Task 6, when the join panel finally needs one — declaring it now would leave an unused destructured binding, which `@typescript-eslint/no-unused-vars` flags as an error.

- [ ] **Step 5: Write the route**

Create `app/stage/[code]/page.tsx`:

```tsx
'use client';
import { Suspense, use } from 'react';
import { useGameStore } from '@/lib/store';
import { useRoomChannel } from '@/lib/useRoomChannel';
import { useRoomRuntimes } from '@/lib/useRoomRuntimes';
import PixiStage from '@/components/PixiStage';
import PerfOverlay from '@/components/PerfOverlay';
import TensionFrame from '@/components/TensionFrame';
import StageBroadcast from '@/components/stage/StageBroadcast';
import StageGate from '@/components/stage/StageGate';

/**
 * "Circuit Break Broadcast" — the read-only spectator screen (PRD §8).
 *
 * READ-ONLY BY COMPOSITION, not by a guard: this route mounts none of the
 * components that can write. No JoinGate, no GameView, no useHostDriver, no
 * SettingsControl. The channel subscription is used for its incoming
 * broadcasts only — the return value is deliberately discarded, because
 * nothing here has anything to send (spec decision 2).
 */
export default function StagePage({ params }: { params: Promise<{ code: string }> }) {
  const { code: rawCode } = use(params);
  const code = rawCode.toUpperCase();
  const room = useGameStore(s => s.room);
  const roomMissing = useGameStore(s => s.roomMissing);

  useRoomChannel(code);
  useRoomRuntimes(code, 'stage');

  if (roomMissing) {
    return (
      <main data-testid="stage-missing" className="grid min-h-screen place-items-center gap-4 p-8 text-center">
        <div>
          <p className="font-display text-[0.6875rem] font-semibold uppercase tracking-[0.28em] text-ink-mute">
            No such room
          </p>
          <p className="font-display text-display font-black tracking-[0.2em] text-ink-dim">{code}</p>
        </div>
      </main>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      {room && <PixiStage code={code} role="stage" />}
      <TensionFrame />
      <Suspense fallback={null}>
        <PerfOverlay />
      </Suspense>
      {room ? (
        <StageBroadcast />
      ) : (
        <main className="grid min-h-screen place-items-center text-ink-dim">Connecting…</main>
      )}
      <StageGate code={code} />
    </div>
  );
}
```

- [ ] **Step 6: Verify types, lint and units**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: tsc silent, lint zero problems, all tests pass.

- [ ] **Step 7: Verify the route by hand**

Start the dev server (`npm run dev`), create a room in one browser window, then open `/stage/<CODE>` in another.

Expected:
1. The gate is visible, showing the room code.
2. Clicking it dismisses it and reveals the canvas with the starting grid.
3. `/stage/ZZZZZ` (a code that does not exist) shows the "No such room" card, not "Connecting…".
4. No YOU ring appears on any rig — including when the stage tab is opened in the *same* browser profile that already joined the room.

- [ ] **Step 8: Commit**

```bash
git add "app/stage/[code]/page.tsx" components/stage/StageGate.tsx components/stage/StageBroadcast.tsx lib/store.ts lib/useRoomChannel.ts
git commit -m "feat: add the read-only stage route with an audio gate and broadcast shell"
```

---

### Task 4: Shared option identity

`AnswerButtons` fixes each option's glyph and accent **by index**, and its own comment states why: "▲ is always cyan across every question in every round." The stage view needs the same table. Two copies would eventually disagree about which glyph the TV gives option 2, and nothing would catch it.

Small, and deliberately its own task: it is the only edit to the player route's most heavily e2e-covered component, and a reviewer should be able to approve or reject it on its own.

**Files:**

- Create: `lib/staging/options.ts`
- Create: `tests/options.test.ts`
- Modify: `components/AnswerButtons.tsx` (delete the local `OPTIONS` constant, import the shared one)

**Interfaces:**

- Consumes: nothing.
- Produces:
  - `interface OptionIdentity { glyph: string; accent: string }`
  - `const OPTION_IDENTITIES: readonly OptionIdentity[]` — length 4, index-aligned.

- [ ] **Step 1: Write the failing test**

Create `tests/options.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { OPTION_IDENTITIES } from '@/lib/staging/options';

/**
 * A characterization test: it pins the table to exactly what
 * components/AnswerButtons.tsx shipped, so the extraction cannot silently
 * reorder or restyle anything the player surface already renders.
 */
describe('OPTION_IDENTITIES', () => {
  it('is the four shipped identities, in order', () => {
    expect(OPTION_IDENTITIES).toEqual([
      { glyph: '▲', accent: 'var(--color-neon-cyan)' },
      { glyph: '◆', accent: 'var(--color-neon-magenta)' },
      { glyph: '●', accent: 'var(--color-neon-lime)' },
      { glyph: '■', accent: 'var(--color-warning)' },
    ]);
  });

  it('gives every index a distinct glyph and a distinct accent', () => {
    const glyphs = OPTION_IDENTITIES.map(o => o.glyph);
    const accents = OPTION_IDENTITIES.map(o => o.accent);
    expect(new Set(glyphs).size).toBe(OPTION_IDENTITIES.length);
    expect(new Set(accents).size).toBe(OPTION_IDENTITIES.length);
  });

  it('covers the maximum option count', () => {
    // Four options per question (lib/types.ts QuestionPublic). A fifth option
    // would read `undefined.glyph` at the render site on both surfaces.
    expect(OPTION_IDENTITIES).toHaveLength(4);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/options.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/staging/options"`.

- [ ] **Step 3: Write the implementation**

Create `lib/staging/options.ts`:

```ts
/**
 * The option identity table (P3a decision 6).
 *
 * Accents are fixed BY INDEX, not by content, so ▲ is always cyan across every
 * question in every round. Shape carries the identity, so nothing that renders
 * these depends on colour alone.
 *
 * Shared by the player surface (components/AnswerButtons.tsx) and the stage
 * surface (components/stage/StageOptions.tsx). It lives here rather than in
 * either component because two copies would eventually disagree about which
 * glyph option 2 gets on the TV, and no test would be looking.
 */
export interface OptionIdentity {
  glyph: string;
  accent: string;
}

export const OPTION_IDENTITIES: readonly OptionIdentity[] = [
  { glyph: '▲', accent: 'var(--color-neon-cyan)' },
  { glyph: '◆', accent: 'var(--color-neon-magenta)' },
  { glyph: '●', accent: 'var(--color-neon-lime)' },
  { glyph: '■', accent: 'var(--color-warning)' },
];
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- tests/options.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Adopt it in AnswerButtons**

In `components/AnswerButtons.tsx`, delete the local constant and its comment block:

```ts
/**
 * The four answers (spec §6).
 *
 * Accents are fixed BY INDEX, not by content, so ▲ is always cyan across every
 * question in every round. Shape carries the identity, so nothing here depends
 * on color alone.
 *
 * Selection is expressed by form, not hue (spec decision 5): a dedicated
 * selection color would collide with option 1's cyan and make the "which
 * option" signal fight the "which is mine" signal.
 */
const OPTIONS = [
  { glyph: '▲', accent: 'var(--color-neon-cyan)' },
  { glyph: '◆', accent: 'var(--color-neon-magenta)' },
  { glyph: '●', accent: 'var(--color-neon-lime)' },
  { glyph: '■', accent: 'var(--color-warning)' },
] as const;
```

Replace it with a docblock that keeps the part specific to this component, and import the table:

```ts
import { OPTION_IDENTITIES } from '@/lib/staging/options';

/**
 * The four answers (spec §6).
 *
 * Glyph and accent come from lib/staging/options.ts, shared with the stage
 * view. Selection is expressed by form, not hue (spec decision 5): a dedicated
 * selection color would collide with option 1's cyan and make the "which
 * option" signal fight the "which is mine" signal.
 */
```

Change the one use site inside the map:

```ts
        const { glyph, accent } = OPTION_IDENTITIES[i];
```

- [ ] **Step 6: Verify types, lint and units**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: tsc silent, lint zero problems, all tests pass.

- [ ] **Step 7: Verify the player surface still renders its options**

Run: `npm run test:e2e -- --workers=2 e2e/staging.spec.ts`
Expected: PASS. `staging.spec.ts` drives the options grid through READ, ANSWER and REVEAL, which is exactly what this extraction could break.

- [ ] **Step 8: Commit**

```bash
git add lib/staging/options.ts tests/options.test.ts components/AnswerButtons.tsx
git commit -m "refactor: share the option identity table between the player and stage surfaces"
```

---

### Task 5: The question on stage

READ, ANSWER and REVEAL in the broadcast band: the prompt at TV scale, the four options as non-interactive tiles, and the reveal transforming those same tiles into the distribution (ADR-0019) with avatar stacks, the fastest stamp and the fun fact.

`RevealPanel` takes only props — `reveal`, `question`, `steps` — with no session read, so it is reused verbatim for the caption. `AvatarStack` and `distributionRows` are likewise reused as-is.

**Files:**

- Create: `components/stage/StageQuestion.tsx`
- Create: `components/stage/StageOptions.tsx`
- Modify: `components/stage/StageBroadcast.tsx` (fill the read/answer/reveal slot)

**Interfaces:**

- Consumes: `OPTION_IDENTITIES` (Task 4); `StageSteps`, `RevealSteps`, `READ_OPTION_STAGGER` from `lib/staging/beats.ts`; `DistributionRow`, `distributionRows` from `lib/staging/distribution.ts`; `AvatarStack`, `RevealPanel`.
- Produces:
  - `<StageQuestion question={QuestionPublic} steps={StageSteps} />`
  - `<StageOptions options={string[]} mode={OptionsMode} rows={DistributionRow[] | undefined} revealSteps={RevealSteps} />`
  - `data-testid="stage-option"` with `data-index` — the e2e hook, deliberately distinct from the player surface's `answer-option`.

- [ ] **Step 1: Write StageQuestion**

Create `components/stage/StageQuestion.tsx`:

```tsx
'use client';
import { AnimatePresence, motion } from 'motion/react';
import type { QuestionPublic } from '@/lib/types';
import type { StageSteps } from '@/lib/staging/beats';
import { EASE } from '@/lib/presentation/tokens';

/**
 * The prompt, at the size a room reads it from.
 *
 * The category and tier badges live in StageBroadcast's status bar rather than
 * here — on a TV the persistent bar is where "what round is this" belongs,
 * and repeating them over the question would crowd the only line anyone is
 * actually reading.
 *
 * `AnimatePresence initial={false}` is required, not decorative: `steps` is
 * derived from the server deadline, so a stage view opening mid-READ gets
 * `steps.question` already true — correct state, but nothing about that says
 * the entrance should play. Without the guard it replays on every reload
 * (CURRENT.md tracks four occurrences of this trap).
 */
export default function StageQuestion({
  question, steps,
}: {
  question: QuestionPublic;
  steps: StageSteps;
}) {
  return (
    <AnimatePresence initial={false}>
      {steps.question && (
        <motion.h2
          key={question.prompt}
          data-testid="stage-question"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0, transition: { duration: 0.46, ease: EASE.snap } }}
          exit={{ opacity: 0 }}
          className="text-balance text-center font-display text-hero font-black leading-tight
            text-ink lg:text-display"
        >
          {question.prompt}
        </motion.h2>
      )}
    </AnimatePresence>
  );
}
```

- [ ] **Step 2: Write StageOptions**

Create `components/stage/StageOptions.tsx`:

```tsx
'use client';
import { motion } from 'motion/react';
import AvatarStack from '@/components/AvatarStack';
import { OPTION_IDENTITIES } from '@/lib/staging/options';
import { READ_OPTION_STAGGER, type OptionsMode, type RevealSteps } from '@/lib/staging/beats';
import type { DistributionRow } from '@/lib/staging/distribution';

/**
 * The four answers on a broadcast screen.
 *
 * Divs, not buttons: a stage view has no interaction affordances, so there is
 * nothing here to focus, disable, or press. The 1-4 keyboard shortcuts, the
 * lock state and the `spectating` fade all belong to the player surface and
 * are deliberately absent.
 *
 * What IS shared is the reveal: the options grid transforms in place into the
 * distribution (ADR-0019), because a separate results list would make the room
 * re-read four options they were just looking at.
 *
 * Opacity is a `motion` variant target and MUST NOT also be a Tailwind class —
 * inline animated styles outrank the class regardless of specificity
 * (ADR-0017).
 */
export default function StageOptions({
  options, mode, rows, revealSteps,
}: {
  options: string[];
  /** 'live' only during ANSWER: the server phase is the sole authority. */
  mode: OptionsMode;
  /** Present only in 'result' mode. */
  rows?: DistributionRow[];
  revealSteps?: RevealSteps;
}) {
  return (
    <motion.div
      className="grid grid-cols-1 gap-4 md:grid-cols-2"
      initial="hidden"
      animate="shown"
      variants={{ shown: { transition: { staggerChildren: READ_OPTION_STAGGER / 1000 } } }}
    >
      {options.map((opt, i) => {
        const { glyph, accent } = OPTION_IDENTITIES[i];
        const result = mode === 'result' ? rows?.[i] : undefined;
        const isCorrect = result?.correct ?? false;
        // In result mode the correct row is bright and the rest go quiet. No
        // red, no ✗ — tone is carried by treatment. Before the reveal, ANSWER
        // is full strength and READ is dimmed.
        const targetOpacity = result ? (isCorrect ? 1 : 0.62) : mode === 'live' ? 1 : 0.55;

        return (
          <motion.div
            key={i}
            data-testid="stage-option"
            data-index={i}
            data-correct={isCorrect ? 'true' : undefined}
            variants={{ hidden: { opacity: 0, y: 14 }, shown: { opacity: targetOpacity, y: 0 } }}
            className={`relative flex items-center gap-4 overflow-hidden rounded-panel border
              border-white/10 border-l-4 bg-night/60 p-5 text-left font-semibold text-ink
              backdrop-blur-md transition-[opacity,border-color] duration-(--dur-cut) ease-snap`}
            style={{
              borderLeftColor: accent,
              backgroundColor: isCorrect
                ? 'color-mix(in oklab, var(--color-correct) 16%, transparent)'
                : undefined,
            }}
          >
            {result && (
              <span
                aria-hidden="true"
                className="absolute inset-y-0 left-0 -z-10 transition-[width] duration-(--dur-beat) ease-snap"
                style={{
                  width: `${(revealSteps?.rows ? result.share : 0) * 100}%`,
                  backgroundColor: `color-mix(in oklab, ${isCorrect ? 'var(--color-correct)' : accent} 12%, transparent)`,
                }}
              />
            )}
            <span
              aria-hidden="true"
              className="grid h-12 w-12 shrink-0 place-items-center rounded-control text-xl"
              style={{
                backgroundColor: `color-mix(in oklab, ${accent} 14%, transparent)`,
                color: accent,
              }}
            >
              {glyph}
            </span>
            <span className="min-w-0 flex-1 text-2xl leading-tight">{opt}</span>
            {result && (
              <>
                <AvatarStack
                  avatars={result.avatars}
                  overflow={result.overflow}
                  show={revealSteps?.stacks ?? false}
                />
                <span className="shrink-0 font-display text-2xl font-black tabular-nums text-ink-dim">
                  {result.count}
                </span>
              </>
            )}
          </motion.div>
        );
      })}
    </motion.div>
  );
}
```

- [ ] **Step 3: Wire them into the shell**

In `components/stage/StageBroadcast.tsx`, add the imports:

```ts
import { distributionRows } from '@/lib/staging/distribution';
import RevealPanel from '@/components/RevealPanel';
import StageOptions from './StageOptions';
import StageQuestion from './StageQuestion';
```

add the selectors next to the existing ones:

```ts
  const reveal = useGameStore(s => s.reveal);
  const standings = useGameStore(s => s.standings);
  const steps = useStaging(s => s.steps);
  const revealSteps = useStaging(s => s.reveal);
```

and derive the rows above the return:

```ts
  /**
   * `myId` is null: there is no local player on a broadcast screen, so no face
   * in a stack ever carries the "you are here" ring (spec §4).
   */
  const rows =
    reveal && question ? distributionRows(question.options, reveal, standings ?? [], null) : undefined;
```

Then replace the Task 3 placeholder comment in the band with:

```tsx
        {beat === 'countdown' && <StageCountdown endsAt={room?.ends_at ?? null} />}

        {question && (beat === 'read' || beat === 'answer' || beat === 'reveal') && (
          <>
            <StageQuestion question={question} steps={steps} />
            {steps.options && (
              <StageOptions
                options={question.options}
                mode={steps.optionsMode}
                rows={rows}
                revealSteps={revealSteps}
              />
            )}
            {beat === 'reveal' && reveal && (
              <RevealPanel reveal={reveal} question={question} steps={revealSteps} />
            )}
          </>
        )}

        {/* Task 6 fills lobby. Task 7 fills track / results. */}
        <LowerThird />
```

Wrap the options slot in `AnimatePresence initial={false}` exactly as `StageShell` does, so the entrance stagger cannot replay on a mid-beat mount:

```tsx
            <AnimatePresence initial={false}>
              {steps.options && (
                <StageOptions
                  key="stage-options"
                  options={question.options}
                  mode={steps.optionsMode}
                  rows={rows}
                  revealSteps={revealSteps}
                />
              )}
            </AnimatePresence>
```

with `import { AnimatePresence } from 'motion/react';` added at the top.

- [ ] **Step 4: Verify types, lint and units**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: tsc silent, lint zero problems, all tests pass.

- [ ] **Step 5: Verify by hand, headed**

With the dev server running: create a room, join from a second context so there are two players, open `/stage/<CODE>`, dismiss the gate, and start the race.

Expected through one full round:
1. READ — badges in the status bar, prompt rises, options appear dimmed.
2. ANSWER — options at full strength, timer ring counting in the top right, vignette ramping.
3. REVEAL — the same four tiles fill with their distribution bars, avatar stacks land, the correct row brightens, "FASTEST ⚡" and the fun fact appear.
4. **Reload the stage tab mid-REVEAL.** The distribution must be present immediately, at rest — no replayed stagger, no re-run bars. This is the replay trap; it is the single most likely way to ship this task broken.
5. No face in any stack carries the local-player ring, even if this browser profile has joined the room.

- [ ] **Step 6: Commit**

```bash
git add components/stage/StageQuestion.tsx components/stage/StageOptions.tsx components/stage/StageBroadcast.tsx
git commit -m "feat: stage the question, options and reveal on the broadcast band"
```

---

### Task 6: The stage lobby

Before the race, the TV is the room's join surface: the code at the size a room reads it from, the join URL, and a QR to scan.

This is the one task that adds a runtime dependency. `qrcode` is dynamically imported and drawn straight onto a canvas ref, so it never enters the player route's bundle and the component holds no React state — the same idiom `PixiStage` uses for its async renderer setup.

**Files:**

- Create: `components/stage/StageJoinPanel.tsx`
- Modify: `components/stage/StageBroadcast.tsx` (grow a `code` prop; fill the lobby slot)
- Modify: `app/stage/[code]/page.tsx` (pass `code` to the shell)
- Modify: `package.json` (add `qrcode` and `@types/qrcode`)

**Interfaces:**

- Consumes: `code`, newly threaded from the route through `StageBroadcast`.
- Produces:
  - `<StageJoinPanel code={code} />`, carrying `data-testid="stage-join"`.
  - `StageBroadcast`'s props become `{ code: string }` — this is the task that introduces them.

- [ ] **Step 1: Add the dependency**

Run:

```bash
npm install qrcode
npm install --save-dev @types/qrcode
```

`qrcode` is MIT-licensed and has no runtime dependencies of its own that reach the browser bundle. Roadmap §2.1 is procedural-first about *assets*; QR is an encoding algorithm rather than art, which is why this is in bounds — but it is M2's first added runtime dependency, so it is called out in the spec (§9) rather than slipped in.

- [ ] **Step 2: Write the panel**

Create `components/stage/StageJoinPanel.tsx`:

```tsx
'use client';
import { useEffect, useRef } from 'react';

/**
 * The lobby on a broadcast screen: how to get into this room.
 *
 * The QR is drawn onto a canvas through a ref rather than rendered from state,
 * which keeps the whole async import out of React's data flow — no setState
 * from an effect, nothing to tear (same idiom as components/PixiStage.tsx).
 * It is `aria-hidden` and the URL sits beside it as text, so a screen reader
 * gets the join address rather than an unlabelled image.
 *
 * `qrcode` is imported dynamically so it never lands in the player route's
 * bundle — a phone that has joined has no use for it.
 */
const QR_PIXELS = 320;

export default function StageJoinPanel({ code }: { code: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const joinUrl = typeof window === 'undefined' ? '' : `${window.location.origin}/room/${code}`;

  useEffect(() => {
    if (!joinUrl) return;
    let cancelled = false;

    void (async () => {
      try {
        const { default: QRCode } = await import('qrcode');
        const canvas = canvasRef.current;
        if (cancelled || !canvas) return;
        await QRCode.toCanvas(canvas, joinUrl, {
          width: QR_PIXELS,
          margin: 1,
          color: { dark: '#eaeeff', light: '#0a0c1cff' },
        });
      } catch (error) {
        // A missing QR is a degraded lobby, not a broken one: the code and the
        // URL beside it are both still readable.
        console.error('[StageJoinPanel] failed to render the QR', error);
      }
    })();

    return () => { cancelled = true; };
  }, [joinUrl]);

  return (
    <section
      data-testid="stage-join"
      className="mx-auto flex items-center gap-12 rounded-panel border border-haze/50
        bg-abyss/70 px-12 py-10 backdrop-blur-md"
    >
      <div className="flex flex-col gap-3">
        <p className="font-display text-[0.6875rem] font-semibold uppercase tracking-[0.28em] text-neon-cyan">
          Join the race
        </p>
        <p className="font-display text-display font-black tracking-[0.2em] text-warning">{code}</p>
        <p className="text-lg text-ink-dim">{joinUrl}</p>
      </div>
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="shrink-0 rounded-control"
        style={{ width: QR_PIXELS, height: QR_PIXELS }}
      />
    </section>
  );
}
```

- [ ] **Step 3: Wire it into the shell**

In `components/stage/StageBroadcast.tsx`, add the import:

```ts
import StageJoinPanel from './StageJoinPanel';
```

give the component the prop it has not needed until now:

```tsx
export default function StageBroadcast({ code }: { code: string }) {
```

and replace the lobby half of the placeholder comment with the panel, above the countdown:

```tsx
        {beat === 'idle' && room?.status === 'lobby' && <StageJoinPanel code={code} />}
```

`beat` is `'idle'` in the lobby — `beatFor('lobby')` maps there (`lib/staging/beats.ts`) — so the `room.status` check is what distinguishes "waiting to start" from "nothing known yet".

Then pass it from `app/stage/[code]/page.tsx`:

```tsx
        <StageBroadcast code={code} />
```

- [ ] **Step 4: Verify types, lint and units**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: tsc silent, lint zero problems, all tests pass.

- [ ] **Step 5: Verify by hand**

Open `/stage/<CODE>` for a room in lobby.

Expected:
1. The code, the join URL and a scannable QR are all visible over the starting grid.
2. Scanning the QR on a phone lands on `/room/<CODE>` and shows the join form.
3. When the host starts the race, the panel disappears and the countdown takes the band.

- [ ] **Step 6: Commit**

```bash
git add components/stage/StageJoinPanel.tsx components/stage/StageBroadcast.tsx "app/stage/[code]/page.tsx" package.json package-lock.json
git commit -m "feat: make the stage lobby the room's join surface"
```

---

### Task 7: The track beat and the ceremony on stage

The last two beats. TRACK is the world's own — the band clears and only the callout remains. RESULTS reuses P5b's board with no local player and no exit link, below the retreating ceremony band.

`StageResults` must carry ADR-0030's one-shot `settled` derivation itself. It is **not** inherited by rendering `WinnerCard` and `ResultsTable`: `lib/ceremony/runtime.ts` publishes from a `requestAnimationFrame` tick started in an effect, so `steps.board` reads false on the first render even when the ceremony finished minutes ago — and a TV switched on late is the normal way to arrive here.

**Files:**

- Create: `components/stage/StageResults.tsx`
- Modify: `components/stage/StageBroadcast.tsx` (fill the track/results slot)

**Interfaces:**

- Consumes: `useCeremony`'s `steps.board`; `BOARD_AT`, `CEREMONY_MS` from `lib/ceremony/beats.ts`; `elapsedIn` from `lib/staging/beats.ts`; `msUntil` from `lib/serverTime.ts`; `WinnerCard`, `ResultsTable`.
- Produces: `<StageResults />`, carrying `data-testid="stage-results"` and `data-entered` (`'true'` once the board is showing) — the same shape `ResultsView` exposes, so an e2e check reads the same way on both surfaces.

- [ ] **Step 1: Write StageResults**

Create `components/stage/StageResults.tsx`:

```tsx
'use client';
import { useState } from 'react';
import { useGameStore } from '@/lib/store';
import { msUntil } from '@/lib/serverTime';
import { elapsedIn } from '@/lib/staging/beats';
import { BOARD_AT, CEREMONY_MS } from '@/lib/ceremony/beats';
import { useCeremony } from '@/lib/ceremony/useCeremony';
import ResultsTable from '@/components/ResultsTable';
import WinnerCard from '@/components/WinnerCard';

/**
 * The results board on a broadcast screen.
 *
 * Differs from components/ResultsView.tsx in exactly two ways: `myId` is null,
 * because there is no local player to highlight; and there is no "Back to
 * home" link, because there is nothing on a TV to press it with.
 *
 * `settled` is the same ONE-SHOT mount-time derivation ResultsView carries
 * (ADR-0030), and it is not optional here. `lib/ceremony/runtime.ts` publishes
 * from a requestAnimationFrame tick started in an effect, so `steps.board`
 * reads FALSE on first render even for a ceremony that ended minutes ago —
 * and a stage view is MORE likely than a player device to arrive that way,
 * because a TV switched on late is the normal case. Without it the whole board
 * would play its entrance on every reload.
 *
 * Read once via a lazy initializer and never updated: same `ends_at`, same
 * `elapsedIn`, same constants the runtime itself uses, so the two answers
 * cannot disagree.
 */
export default function StageResults() {
  const room = useGameStore(s => s.room);
  const standings = useGameStore(s => s.standings);
  const board = useCeremony(s => s.steps.board);
  const endsAt = room?.ends_at ?? null;

  const [settled] = useState(
    () => elapsedIn(CEREMONY_MS, endsAt ? msUntil(endsAt) : null) >= BOARD_AT,
  );

  if (!room || !standings || standings.length === 0) return null;

  const show = board || settled;

  return (
    <div
      data-testid="stage-results"
      data-entered={show ? 'true' : 'false'}
      className="mx-auto flex w-full max-w-4xl flex-col gap-6"
    >
      <WinnerCard winner={standings[0]} totalRounds={room.total_rounds} show={show} instant={settled} />
      <ResultsTable standings={standings} myId={null} show={show} instant={settled} />
    </div>
  );
}
```

- [ ] **Step 2: Give RESULTS its own root layout**

The shell's normal root is a `justify-between` column: status bar pinned top, band pinned bottom. RESULTS cannot use it. The canvas occupies `--ceremony-band` from the *top* (100vh, retreating to 50vh when the board lands), so the board must start below that and be free to run past the fold with a large field — a bottom-pinned band would sit under the podium and a spacer added as a third child of `justify-between` would push the status bar into the middle of the screen.

So RESULTS returns early with a scrollable top-down column instead. Note it is **not** `pointer-events-none`: a long results table on a shared screen has to be scrollable.

In `components/stage/StageBroadcast.tsx`, add the import:

```ts
import StageResults from './StageResults';
```

and insert this branch immediately before the component's main `return`:

```tsx
  if (beat === 'results') {
    return (
      <div
        data-testid="stage-broadcast"
        data-beat={beat}
        className="fixed inset-0 z-10 overflow-y-auto p-8"
      >
        {/*
          Reserves exactly the height PixiStage is showing, so the board can
          never overlap the podium (ADR-0015: the band is published once and
          consumed, never re-derived). The 0px fallback is what a client with
          no canvas at all gets — the full board, immediately.
        */}
        <div
          aria-hidden="true"
          className="transition-[height] duration-(--dur-settle) ease-settle"
          style={{ height: 'var(--ceremony-band, 0px)' }}
        />
        <StageResults />
      </div>
    );
  }
```

`data-testid` and `data-beat` are repeated deliberately: the e2e suite tracks the beat through this element across the whole game, so the results branch must keep answering to the same handle.

TRACK needs no entry at all. Nothing in the band matches `beat === 'track'`, so the region empties and only `LowerThird` remains over the world — which is the beat the world already owns.

- [ ] **Step 3: Verify types, lint and units**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: tsc silent, lint zero problems, all tests pass.

- [ ] **Step 4: Verify by hand, headed**

Play a full 1-question game with two players and the stage view open.

Expected:
1. TRACK — the band is empty, the world fills the screen, the callout appears over it.
2. RESULTS — the podium rises, then the band retreats and the winner card and full table arrive below it.
3. No row in the table is marked as the local player.
4. **Reload the stage tab after the ceremony has settled.** `data-entered` must read `"true"` immediately; it must never be observed transitioning from `"false"`. Check it in the console: `document.querySelector('[data-testid="stage-results"]').dataset.entered`.
5. **Known and accepted:** the winner's podium rig is clipped at the top of the 50vh canvas. That is the pre-existing P5a defect recorded in `CURRENT.md` and deferred to P6b (spec §12). Do not fix it here.

- [ ] **Step 5: Commit**

```bash
git add components/stage/StageResults.tsx components/stage/StageBroadcast.tsx
git commit -m "feat: carry the track beat and the ceremony onto the stage view"
```

---

### Task 8: The stage link in the lobby

The route needs a way in that is not "type this URL on a TV remote". A host-only panel in the lobby: the stage URL, copy, and open-in-new-tab.

This is an addition, not a restyle. `LobbyView` is still M1-era amber/slate and predates the design system; rewriting it is real work with its own visual decisions, and doing it as a rider on this phase would hide it inside a task about something else (spec §12.8).

**Files:**

- Modify: `components/LobbyView.tsx`

**Interfaces:**

- Consumes: `code` and `isHost`, both already props on `LobbyView`.
- Produces: `data-testid="stage-link"` — an anchor whose `href` is the stage URL.

- [ ] **Step 1: Add the panel**

In `components/LobbyView.tsx`, add the import:

```ts
import { useState } from 'react';
```

and insert this section between the roster `<section>` and the host/waiting block:

```tsx
      {isHost && <StageLink code={code} />}
```

Then add the component at the bottom of the file:

```tsx
/**
 * The way into the broadcast screen (PRD §1: a room hands out a join link, a
 * QR and a stage link).
 *
 * Host-only: a player tapping this on their phone would replace their own game
 * with a spectator view of it. The anchor carries a real href so it can be
 * copied, opened in a new tab, or dragged onto a second display — a button
 * that only calls `window.open` can do none of those.
 */
function StageLink({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const url = typeof window === 'undefined' ? '' : `${window.location.origin}/stage/${code}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard access can be denied outright (insecure origin, permission
      // policy). The URL is on screen either way, so this is a silent no-op
      // rather than an error the host can do anything about.
    }
  }

  return (
    <section className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-abyss/70 p-4">
      <div className="min-w-0">
        <h2 className="text-sm font-bold uppercase tracking-widest text-slate-400">Stage view</h2>
        <p className="truncate text-sm text-slate-300">{url}</p>
      </div>
      <div className="flex shrink-0 gap-2">
        <button
          type="button"
          onClick={copy}
          className="rounded-lg border border-white/15 px-3 py-2 text-sm font-semibold text-slate-200"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
        <a
          data-testid="stage-link"
          href={`/stage/${code}`}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg bg-amber-400 px-3 py-2 text-sm font-bold text-slate-950"
        >
          Open
        </a>
      </div>
    </section>
  );
}
```

The amber/slate classes here match `LobbyView`'s existing M1 palette on purpose. Introducing design-system tokens into one panel of an otherwise-unrestyled screen would look like a bug; the restyle happens all at once, later, as its own work.

- [ ] **Step 2: Verify types, lint and units**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: tsc silent, lint zero problems, all tests pass.

- [ ] **Step 3: Verify the lobby still behaves**

Run: `npm run test:e2e -- --workers=2 e2e/game-flow.spec.ts e2e/join.spec.ts`
Expected: PASS. Both drive the lobby, and `game-flow.spec.ts` asserts `Starting grid — {n} joined` and the start-button copy verbatim — neither is touched by this change.

- [ ] **Step 4: Verify by hand**

In a lobby as host: the Stage view panel is present, "Copy" reports Copied, and "Open" opens `/stage/<CODE>` in a new tab. As a *joined non-host* player in the same room: no panel.

- [ ] **Step 5: Commit**

```bash
git add components/LobbyView.tsx
git commit -m "feat: surface the stage link in the lobby for the host"
```

---

### Task 9: End-to-end coverage and phase verification

The regression net for everything above, plus the full verification pass against the spec's exit criteria.

**Files:**

- Create: `e2e/stage.spec.ts`

**Interfaces:**

- Consumes: every `data-testid` produced by Tasks 3, 5, 6 and 7 — `stage-gate`, `stage-broadcast` (`data-beat`), `stage-band`, `stage-option`, `stage-join`, `stage-results`, `stage-missing`, `stage-link`.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write the e2e spec**

Create `e2e/stage.spec.ts`. The room-creation preamble is inlined rather than shared, matching every other spec in `e2e/` — there is no helper module in this suite and adding one is not this phase's work.

```ts
import { test, expect, type Page } from '@playwright/test';

/**
 * Create a one-question room and return its code. Mirrors the preamble in
 * e2e/staging.spec.ts — one question keeps a full game inside the timeout.
 */
async function createRoom(host: Page, nickname: string): Promise<string> {
  await host.goto('/host/new');

  const minusButtons = host.getByRole('button', { name: '−' });
  const clicksPerTier = [3, 4, 3, 1]; // 4,4,3,1 -> 1,0,0,0
  for (let i = 0; i < clicksPerTier.length; i++) {
    for (let c = 0; c < clicksPerTier[i]; c++) await minusButtons.nth(i).click();
  }
  await expect(host.getByText(/^1 questions/)).toBeVisible();

  await host.getByPlaceholder('Your nickname').fill(nickname);
  await host.getByRole('button', { name: /create room/i }).click();
  await expect(host).toHaveURL(/\/room\/[A-Z0-9]{5}$/);
  return host.url().split('/').pop()!;
}

test('the stage view follows a live game without a session', async ({ page, browser }) => {
  test.setTimeout(90_000);
  const host = page;
  const code = await createRoom(host, 'Hosty');

  const joinerContext = await browser.newContext();
  const joiner = await joinerContext.newPage();
  await joiner.goto(`/room/${code}`);
  await joiner.getByPlaceholder('Your nickname').fill('Joiner');
  await joiner.getByRole('button', { name: 'Join game' }).click();
  await expect(host.getByText('Starting grid — 2 joined')).toBeVisible();

  // A THIRD context with no session at all: the stage view must never ask it
  // to join.
  const stageContext = await browser.newContext();
  const stage = await stageContext.newPage();
  await stage.goto(`/stage/${code}`);

  await expect(stage.getByPlaceholder('Your nickname')).toHaveCount(0);
  await expect(stage.getByTestId('stage-gate')).toBeVisible();
  await stage.getByTestId('stage-gate').click();
  await expect(stage.getByTestId('stage-gate')).toHaveCount(0);

  // Lobby: the TV is the join surface.
  await expect(stage.getByTestId('stage-join')).toBeVisible();
  await expect(stage.getByTestId('stage-join')).toContainText(code);

  await host.getByRole('button', { name: /start the race/i }).click();

  const broadcast = stage.getByTestId('stage-broadcast');
  await expect(broadcast).toHaveAttribute('data-beat', 'read', { timeout: 20_000 });
  await expect(stage.getByTestId('stage-question')).toBeVisible();

  // ANSWER: four option tiles, none of them a control.
  await expect(broadcast).toHaveAttribute('data-beat', 'answer', { timeout: 20_000 });
  await expect(stage.getByTestId('stage-option')).toHaveCount(4);
  await expect(stage.getByTestId('stage-band').getByRole('button')).toHaveCount(0);
  await expect(stage.getByTestId('stage-band').getByRole('link')).toHaveCount(0);

  await joiner.getByTestId('answer-option').first().click();

  // REVEAL: the options grid becomes the distribution in place.
  await expect(broadcast).toHaveAttribute('data-beat', 'reveal', { timeout: 20_000 });
  await expect(stage.locator('[data-testid="stage-option"][data-correct="true"]')).toHaveCount(1);

  // TRACK, then the ceremony.
  await expect(broadcast).toHaveAttribute('data-beat', 'track', { timeout: 20_000 });
  await expect(broadcast).toHaveAttribute('data-beat', 'results', { timeout: 30_000 });
  await expect(stage.getByTestId('stage-results')).toBeVisible();

  // A reload past the settled ceremony lands entered, never animating in.
  await stage.reload();
  await stage.getByTestId('stage-gate').click();
  await expect(stage.getByTestId('stage-results')).toHaveAttribute('data-entered', 'true', {
    timeout: 20_000,
  });

  await stageContext.close();
  await joinerContext.close();
});

test('the stage view ignores a session for the room it is watching', async ({ page }) => {
  test.setTimeout(60_000);
  const host = page;
  const code = await createRoom(host, 'Hosty');

  // Same context, same storage: the host's own session for this room is
  // present. Opening the stage link here must still produce a broadcast, not
  // a second player view (spec decision 1).
  await host.goto(`/stage/${code}`);

  await expect(host.getByTestId('stage-gate')).toBeVisible();
  await host.getByTestId('stage-gate').click();

  await expect(host.getByTestId('stage-join')).toBeVisible();
  // No player affordances leak in: no join form, no start button, no answers.
  await expect(host.getByPlaceholder('Your nickname')).toHaveCount(0);
  await expect(host.getByRole('button', { name: /start the race/i })).toHaveCount(0);
  await expect(host.getByTestId('answer-option')).toHaveCount(0);
});

test('an unknown room code reads as a typo, not as a hang', async ({ page }) => {
  await page.goto('/stage/ZZZZZ');
  await expect(page.getByTestId('stage-missing')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('stage-missing')).toContainText('ZZZZZ');
});

test('the host can reach the stage view from the lobby', async ({ page }) => {
  test.setTimeout(60_000);
  const host = page;
  const code = await createRoom(host, 'Hosty');

  const link = host.getByTestId('stage-link');
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', `/stage/${code}`);
});
```

- [ ] **Step 2: Run the new spec**

Run: `npm run test:e2e -- --workers=2 e2e/stage.spec.ts`
Expected: 4 tests pass. If a beat assertion times out, check the beat it actually reached — the phase durations come from `lib/staging/beats.ts`'s `NOMINAL_MS`, and a slow machine can need a longer timeout rather than a different assertion.

- [ ] **Step 3: Run the full regression suite**

Run: `npm run test:e2e -- --workers=2`
Expected: every test passes, existing and new. Re-run any single failure alone before treating it as real — this suite flakes under load at higher worker counts.

- [ ] **Step 4: Full verification pass**

Run each and confirm the output:

```bash
npx tsc --noEmit
npm run lint
npm test
npm run build
npm run test:e2e -- --workers=2
```

Expected: tsc silent · lint zero problems · all unit tests pass · build succeeds · all e2e tests pass.

- [ ] **Step 5: Verify the exit criteria by hand, headed**

Against spec §13, with two player devices and the stage view open in a headed browser at 1920×1080:

1. A full game runs on the stage view — lobby → countdown → rounds → track → ceremony → results — with no interaction after the gate.
2. Open the stage view in a browser profile that has already joined: identical, no YOU ring, no highlighted results row.
3. Open a **second** stage view on the same room: both follow the same phases.
4. With the network tab filtered to `rest/v1/rpc`, the stage tab issues only `get_room_state` reads across the whole game — no `submit_answer`, no `advance_phase`, no `join_room`.
5. Audio plays on stage after the gate is tapped, and the podium fanfare lands.
6. The world is full bleed at every phase on stage, and still a 28vh strip on the player route.
7. Set the profile override to `reduced` on the stage device (`localStorage` key written by `lib/presentation/profile.ts`) and confirm the show degrades rather than breaking; confirm the same under OS-level reduced motion.

Then the spec's edge cases (§10), which the e2e suite cannot reach:

8. **Opened mid-game.** Open the stage view fresh at round 4 of a longer game. It must land on the correct beat at the correct position, with the music bed already at the right state and **no** stinger replaying — ADR-0024's catch-up flag, inherited by keeping the mount order intact.
9. **Opened mid-ceremony.** Open the stage view after the ceremony has started. Expect confetti to be able to burst at full density even under a reduced profile — that is the **known** P5a defect recorded in `CURRENT.md` (`budget` starts at `full` and only converges after the runtime's first ~500ms tick), and a TV switched on late is the normal way to hit it. Confirm it is that defect and not something new; do not fix it here.
10. **No usable WebGL.** Launch the stage view with WebGL disabled (Chrome: `--disable-gpu --disable-software-rasterizer`, or block WebGL in site settings). `PixiStage` must log the failure and leave the HTML intact: question, options, timer, reveal and results all still readable, no crash, no blank screen.

Record anything that does not hold. Known and accepted (spec §12): the winner's podium rig is clipped at the top of the retreated band, and a deep tie stack can lose its top rigs on a non-16:9 display. Neither is a P6a defect.

- [ ] **Step 6: Commit**

```bash
git add e2e/stage.spec.ts
git commit -m "test: cover the stage view end to end"
```

- [ ] **Step 7: Write the ADRs**

Spec §14 names three decisions that outlive this phase. Follow `docs/ADR/README.md` for the numbering and format — the next free number is 0031.

1. **The viewer role is explicit, never inferred from a missing session.** The decision, the host-opens-the-TV-on-their-own-laptop case that motivates it, and why it lives in one pure function rather than four `if` statements at the call sites.
2. **The baked texture cache is per-`Application`.** Write this as an **amendment to ADR-0011**, not a new record — 0011 is where the cache's stalability was originally reasoned about, and splitting the reasoning across two documents is how the next person misses half of it.
3. **The stage view is composed, not configured.** Why a second set of components beat a `surface` prop on the player's, and what that costs: `lib/staging/options.ts` is the seam that pays for it, and it is the only thing preventing the two surfaces from drifting apart.

Commit them with the documentation in Step 9.

- [ ] **Step 8: Write the phase record and update the tracker**

Create `docs/progress/P6a-stage-view.md` following the shape of `docs/progress/P5b-results-board.md`: scope, what was built, deviations from the spec, verification results (paste the actual command output counts), and anything found live that is worth carrying forward.

Then update `docs/progress/CURRENT.md`:
- Move the "Current phase" entry to point at P6a as last completed and P6b as next up.
- **Remove** the tech-debt entry for the baked-avatar texture cache — Task 1 fixed it.
- Leave the `MAX_STACK_RISE`, `TRACK_MARGIN`, off-screen-marker-direction, `advance_phase` 400, podium-clipping and confetti-density entries in place, and update the two that name P6 to name **P6b**.

- [ ] **Step 9: Commit the documentation**

Run `mcp__ide__getDiagnostics` on every markdown file touched before committing — markdown included, per the project's standing practice.

```bash
git add docs/ADR/ docs/progress/P6a-stage-view.md docs/progress/CURRENT.md
git commit -m "docs: record P6a, its ADRs, and hand the framing debt to P6b"
```

---

## Notes for the executor

- **Task order is a dependency chain for Tasks 1–3 and 9.** Task 2's `PixiStage` prop change makes `role` required, so Task 3's route cannot compile before it. Tasks 5, 6 and 7 all modify `components/stage/StageBroadcast.tsx` and each fills a different slot in it — they are independent in content but will conflict in the file if run in parallel worktrees. Run them in order.
- **`lib/staging/beats.ts` is the source of every timing constant.** Do not introduce a new delay, stagger or hold; if a stage component needs one, it reads the existing constant, so the TV and the phone cannot drift apart.
- **When something looks like a bug in the world, check `CURRENT.md` before debugging it.** Several visible defects on a TV are known, recorded, and explicitly deferred to P6b.
