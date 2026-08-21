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
import { Grade } from './Grade';
import { ParallaxLayer } from './ParallaxLayer';
import { TrackSurface } from './TrackSurface';

export class WorldScene {
  readonly root = new Container();
  private readonly backdrop = new Container();
  private readonly zoneLayers = new Map<ZoneId, ParallaxLayer[]>();
  private readonly grade: Grade;
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

    this.root.addChild(this.grade.graphic);
    app.stage.addChild(this.root);
  }

  applyFrame(frame: WorldFrameState): void {
    for (const [zoneId, layers] of this.zoneLayers) {
      const weight = frame.zones[zoneId];
      for (const layer of layers) layer.update(frame.camera, frame.viewport, weight, frame.elapsedMs);
    }

    // The track is world content, so it must sit above the backdrop but below
    // the grade; rebuild only if the room's question count changed.
    if (this.trackSegments !== frame.metrics.segments) {
      this.track?.destroy();
      this.track = new TrackSurface(this.definition, frame.metrics);
      this.trackSegments = frame.metrics.segments;
      this.root.addChildAt(this.track.container, this.root.getChildIndex(this.grade.graphic));
    }
    this.track!.update(frame.camera, frame.viewport);

    this.grade.update(frame.grade, frame.viewport);
  }

  destroy(): void {
    for (const layers of this.zoneLayers.values()) for (const layer of layers) layer.destroy();
    this.zoneLayers.clear();
    this.track?.destroy();
    this.grade.destroy();
    this.app.stage.removeChild(this.root);
    this.root.destroy({ children: true });
  }
}
