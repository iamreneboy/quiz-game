/**
 * The renderer (spec §3). Consumes a WorldDefinition and a per-frame
 * WorldFrameState; never reads the game store or the cue bus.
 *
 * Zone weights are sampled at the CAMERA CENTRE rather than per tile — a
 * deliberate simplification. Backdrop layers are wide and low-frequency, so a
 * single blend value reads as a smooth crossfade as the camera travels, at a
 * fraction of the cost of per-tile sampling.
 */
import { Application, Container, type Renderer } from 'pixi.js';
import type { Profile } from '@/lib/presentation/profile';
import { layersForProfile, type WorldDefinition } from '../definition';
import type { WorldFrameState } from '../frame';
import type { ZoneId } from '../zones';
import { Avatars, type AvatarPlayer } from './Avatars';
import { Confetti } from './Confetti';
import { Grade } from './Grade';
import { ParallaxLayer } from './ParallaxLayer';
import { Podium } from './Podium';
import { TrackSurface } from './TrackSurface';

export class WorldScene {
  readonly root = new Container();
  private readonly backdrop = new Container();
  private readonly zoneLayers = new Map<ZoneId, ParallaxLayer[]>();
  private readonly grade: Grade;
  private readonly avatars: Avatars;
  private readonly podium = new Podium();
  private readonly confetti = new Confetti();
  private lastFrameAt = 0;
  private players: readonly AvatarPlayer[] = [];
  private track: TrackSurface | null = null;
  private trackSegments = -1;

  constructor(
    private readonly app: Application<Renderer>,
    private readonly definition: WorldDefinition,
    profile: Profile,
  ) {
    this.grade = new Grade(profile);
    this.root.addChild(this.backdrop);

    for (const zone of definition.zones) {
      const layers = layersForProfile(zone, profile).map(spec => new ParallaxLayer(app, spec));
      this.zoneLayers.set(zone.id, layers);
      for (const layer of layers) this.backdrop.addChild(layer.sprite);
    }

    // Podium BELOW avatars, so a rig stands in front of (not behind) its block.
    this.root.addChild(this.podium.container);
    this.avatars = new Avatars(app, profile);
    this.root.addChild(this.avatars.container);

    this.root.addChild(this.grade.graphic);
    // Confetti ABOVE the grade — added after it — so the celebration reads at
    // full colour instead of getting tinted by the mood overlay everything
    // else in the world sits under. The ceremony deliberately grades the
    // podium and the avatars on it (Task 5 holds escalation at 1 for exactly
    // that neon-dimmed look); confetti is the one thing that's meant to pop
    // clear of it.
    this.root.addChild(this.confetti.container);
    app.stage.addChild(this.root);
  }

  setPlayers(players: readonly AvatarPlayer[]): void {
    this.players = players;
  }

  applyFrame(frame: WorldFrameState): void {
    for (const [zoneId, layers] of this.zoneLayers) {
      const weight = frame.zones[zoneId];
      for (const layer of layers) layer.update(frame.camera, frame.viewport, weight, frame.elapsedMs);
    }

    // The track is world content, so it must sit above the backdrop but below
    // the avatars and the grade; rebuild only if the room's question count changed.
    if (this.trackSegments !== frame.metrics.segments) {
      this.track?.destroy();
      this.track = new TrackSurface(this.definition, frame.metrics);
      this.trackSegments = frame.metrics.segments;
      this.root.addChildAt(this.track.container, this.root.getChildIndex(this.avatars.container));
    }
    this.track!.update(frame.camera, frame.viewport);

    this.podium.update(frame);

    // Same dt derivation as Avatars.apply, including the 64ms clamp that keeps
    // a backgrounded tab from teleporting every piece off screen on return.
    const dtMs = this.lastFrameAt === 0 ? 16 : Math.min(64, frame.elapsedMs - this.lastFrameAt);
    this.lastFrameAt = frame.elapsedMs;
    this.confetti.update(frame, dtMs);

    this.grade.update(frame.grade, frame.viewport);

    this.avatars.setPlayers(this.players);
    this.avatars.apply(
      frame.avatars, frame.camera, frame.viewport,
      frame.allowance, frame.localPlayerId, frame.elapsedMs,
    );
  }

  destroy(): void {
    for (const layers of this.zoneLayers.values()) for (const layer of layers) layer.destroy();
    this.zoneLayers.clear();
    this.track?.destroy();
    this.grade.destroy();
    this.podium.destroy();
    this.confetti.destroy();
    this.avatars.destroy();
    this.app.stage.removeChild(this.root);
    this.root.destroy({ children: true });
  }
}
