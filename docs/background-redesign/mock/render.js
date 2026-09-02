// Canvas2D stand-in for the slice of PixiJS Graphics the world content uses,
// plus a faithful re-implementation of ParallaxLayer.update / Grade.update /
// TrackSurface so the mockups are the real layer code composited, not art.
window.CB = window.CB || {};
(() => {
  const hex = c => '#' + c.toString(16).padStart(6, '0');

  class G {
    constructor(ctx) { this.ctx = ctx; this.shapes = []; this.poly = null; }
    rect(x, y, w, h) { this.shapes.push(['r', x, y, w, h]); return this; }
    roundRect(x, y, w, h, r) { this.shapes.push(['rr', x, y, w, h, r]); return this; }
    circle(x, y, r) { this.shapes.push(['e', x, y, r, r]); return this; }
    ellipse(x, y, rx, ry) { this.shapes.push(['e', x, y, rx, ry]); return this; }
    moveTo(x, y) { this._flushPoly(); this.poly = [[x, y]]; return this; }
    lineTo(x, y) { (this.poly ||= []).push([x, y]); return this; }
    closePath() { this._flushPoly(); return this; }
    _flushPoly() { if (this.poly && this.poly.length > 1) this.shapes.push(['p', this.poly]); this.poly = null; }
    _trace(s) {
      const c = this.ctx; c.beginPath();
      if (s[0] === 'r') c.rect(s[1], s[2], s[3], s[4]);
      else if (s[0] === 'rr') c.roundRect(s[1], s[2], s[3], s[4], s[5]);
      else if (s[0] === 'e') c.ellipse(s[1], s[2], Math.max(0, s[3]), Math.max(0, s[4]), 0, 0, Math.PI * 2);
      else { c.moveTo(s[1][0][0], s[1][0][1]); for (let i = 1; i < s[1].length; i++) c.lineTo(s[1][i][0], s[1][i][1]); c.closePath(); }
    }
    fill(o = {}) {
      this._flushPoly();
      const c = this.ctx; c.fillStyle = hex(o.color ?? 0xffffff); c.globalAlpha = o.alpha ?? 1;
      for (const s of this.shapes) { this._trace(s); c.fill(); }
      c.globalAlpha = 1; this.shapes = []; return this;
    }
    stroke(o = {}) {
      this._flushPoly();
      const c = this.ctx; c.strokeStyle = hex(o.color ?? 0xffffff); c.lineWidth = o.width ?? 1; c.globalAlpha = o.alpha ?? 1;
      for (const s of this.shapes) { this._trace(s); c.stroke(); }
      c.globalAlpha = 1; this.shapes = []; return this;
    }
  }

  const bakes = new Map();
  function bake(layer) {
    if (bakes.has(layer.id)) return bakes.get(layer.id);
    const cv = document.createElement('canvas');
    cv.width = layer.repeatWidth; cv.height = layer.height;
    const ctx = cv.getContext('2d');
    layer.draw(new G(ctx), { width: layer.repeatWidth, height: layer.height, color: CB.COLOR });
    bakes.set(layer.id, cv);
    return cv;
  }

  const HORIZON = 0.72, SEGMENT = 320, ROAD_DEPTH = 150;
  const RACERS = [0xf59e0b, 0x38bdf8, 0xa78bfa, 0x34d399, 0xfb7185, 0xfacc15, 0xf97316, 0x22d3ee];

  /**
   * opts: { width, height, dpr, span, centerX, weights:{officePark,neonCity,stadium},
   *         profile:'high'|'reduced', grade:{intensity,hue}, segments, racers:boolean }
   */
  CB.render = function (canvas, o) {
    const dpr = o.dpr || 1;
    canvas.width = o.width * dpr; canvas.height = o.height * dpr;
    const c = canvas.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.imageSmoothingEnabled = true;
    c.fillStyle = hex(CB.COLOR.abyss); c.fillRect(0, 0, o.width, o.height);
    const scale = o.width / o.span;
    const ground = o.height * HORIZON;

    for (const zone of CB.NIGHT_RACE.zones) {
      const weight = o.weights[zone.id] ?? 0;
      if (weight <= 0.001) continue;
      const layers = o.profile === 'high' ? zone.layers : zone.layers.filter(l => l.layerTier === 'core');
      for (const layer of layers) {
        const tile = bake(layer);
        const tw = layer.repeatWidth * scale, th = layer.height * scale;
        const y = ground * layer.anchorY - th;
        let offset = (-o.centerX * scale * layer.parallax) % tw; if (offset > 0) offset -= tw;
        c.globalAlpha = weight;
        for (let x = offset; x < o.width; x += tw) c.drawImage(tile, x, y, tw + 0.5, th);
        c.globalAlpha = 1;
      }
    }

    // TrackSurface
    const segs = o.segments ?? 8;
    const wx = x => o.width / 2 + (x - o.centerX) * scale;
    const road = CB.NIGHT_RACE.road;
    c.fillStyle = hex(road.surface); c.fillRect(0, ground, o.width, ROAD_DEPTH * scale);
    c.fillStyle = hex(road.edge); c.fillRect(0, ground, o.width, 5 * scale);
    for (let s = 0; s <= segs; s++) {
      const fin = s === segs;
      c.globalAlpha = fin ? 0.95 : 0.35; c.fillStyle = hex(fin ? road.finish : road.tick);
      c.fillRect(wx(s * SEGMENT) - 2 * scale, ground - 18 * scale, 4 * scale, (ROAD_DEPTH + 18) * scale);
    }
    c.globalAlpha = 1;

    // Avatar stand-ins (not part of the redesign) — to judge value separation.
    if (o.racers) {
      const base = Math.round(o.centerX / SEGMENT) + 0.4;
      [[0, 0], [-0.4, 1], [-0.45, 2], [-1.1, 3], [-1.8, 4]].forEach(([seg, i], k) => {
        const x = wx((base + seg) * SEGMENT), r = 26 * scale, y = ground - 46 * scale - (k === 2 ? 45 * scale : 0);
        c.fillStyle = hex(RACERS[i]); c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
        c.fillStyle = hex(CB.COLOR.void); c.beginPath(); c.arc(x, y, r * 0.55, 0, Math.PI * 2); c.fill();
        c.fillStyle = hex(RACERS[i]); c.fillRect(x - r * 0.35, y + r * 0.8, r * 0.7, 30 * scale);
      });
    }

    // Grade
    if (o.grade) {
      const color = hex(o.grade.hue === 'neon' ? CB.COLOR.neonMagenta : CB.COLOR.void);
      const peak = o.grade.intensity * (o.grade.hue === 'neon' ? 0.34 : 0.5);
      c.fillStyle = color;
      if (o.profile === 'reduced') { c.globalAlpha = peak; c.fillRect(0, 0, o.width, o.height); }
      else {
        const band = o.height / 8;
        for (let i = 0; i < 8; i++) {
          const d = Math.abs(i - 3.5) / 3.5;
          c.globalAlpha = peak * (0.45 + 0.55 * d);
          c.fillRect(0, i * band, o.width, band + 1);
        }
      }
      c.globalAlpha = 1;
    }
  };

  CB.gradeState = (progress, escalation) => {
    const base = 0.22 + 0.38 * progress;
    return { intensity: base + (0.92 - base) * escalation, hue: escalation > 0 ? 'neon' : 'neutral' };
  };
})();
