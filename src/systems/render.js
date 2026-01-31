import { getSleep } from '../lib/sleep.js';

const defaults = {
  clip: true,
  oobBackground: '#111111',
  worldBackground: '#212121',
  wireframe: false,
  debugSleep: false,
};

function makeBucket() {
  return {
    texts: [],
    lines: [],
    circles: [],
    aabbs: [],
  };
}

export class RenderSystem {
  #cfg = { ...defaults };
  #zoom = 100;
  #ox = 0;
  #oy = 0;
  #buckets = new Map();
  #bucketKeys = new Set();

  #canvas;
  #ctx;
  #em;
  #world;

  updateCanvas = () => {
    const c = this.#canvas;
    c.width = c.clientWidth;
    c.height = c.clientHeight;

    const sx = c.width / this.#world.width;
    const sy = c.height / this.#world.height;
    this.#zoom = Math.min(sx, sy);

    const worldPxW = this.#world.width * this.#zoom;
    const worldPxH = this.#world.height * this.#zoom;
    this.#ox = (c.width - worldPxW) / 2;
    this.#oy = (c.height + worldPxH) / 2;
  };

  constructor({ em, worldId, canvas, ...opts }) {
    this.#canvas = canvas;
    this.#ctx = canvas.getContext('2d');
    this.#em = em;
    this.#world = em.getComponent(worldId, 'world');
    this.configure(opts);

    this.updateCanvas();
    window.addEventListener('resize', this.updateCanvas);
  }

  destroy() {
    window.removeEventListener('resize', this.updateCanvas);
  }

  configure(patch = {}) {
    this.#cfg = { ...this.#cfg, ...patch };
    return this;
  }

  get zoom() {
    return this.#zoom;
  }

  #sx(x) {
    return this.#ox + x * this.#zoom;
  }

  #sy(y) {
    return this.#oy - y * this.#zoom;
  }

  #resetBuckets() {
    for (const b of this.#buckets.values()) {
      b.texts.length = 0;
      b.lines.length = 0;
      b.circles.length = 0;
      b.aabbs.length = 0;
    }
    this.#bucketKeys.clear();
  }

  #bucket(zIndex) {
    let b = this.#buckets.get(zIndex);
    if (!b) {
      b = makeBucket();
      this.#buckets.set(zIndex, b);
    }
    this.#bucketKeys.add(zIndex);
    return b;
  }

  #shouldWire(id) {
    if (this.#cfg.wireframe) return true;
    if (!this.#cfg.debugSleep) return false;
    return getSleep(this.#em, id).isSleeping;
  }

  #drawText(ctx, worldPxW, worldPxH, render, pos, text) {
    const x = this.#sx(pos.x + render.offset.x);
    const y = this.#sy(pos.y + render.offset.y);

    ctx.save();
    ctx.globalAlpha = (text.alpha ?? 1) * (ctx.globalAlpha ?? 1);
    ctx.fillStyle = render.color;
    ctx.textAlign = text.align;
    ctx.textBaseline = text.baseline;

    let fontSize = text.size;
    if (text.fit) {
      const sample = 100;
      ctx.font = `${text.weight} ${sample}px ${text.font}`;

      const m = ctx.measureText(text.value);
      const measuredW = m.width || 1;
      const measuredH =
        m.actualBoundingBoxAscent + m.actualBoundingBoxDescent || sample;

      const maxW = worldPxW * (1 - 2 * text.pad);
      const maxH = worldPxH * (1 - 2 * text.pad);
      const scale = Math.min(maxW / measuredW, maxH / measuredH);
      fontSize = Math.max(8, Math.floor(sample * scale));
    }

    ctx.font = `${text.weight} ${fontSize}px ${text.font}`;
    ctx.fillText(text.value, x, y);
    ctx.restore();
  }

  #drawLine(ctx, color, width, a, b) {
    ctx.lineWidth = width;
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.moveTo(this.#sx(a.x), this.#sy(a.y));
    ctx.lineTo(this.#sx(b.x), this.#sy(b.y));
    ctx.stroke();
  }

  #drawCircle(ctx, id, render, pos, circle) {
    const x = this.#sx(pos.x + render.offset.x);
    const y = this.#sy(pos.y + render.offset.y);
    const r = circle.radius * this.#zoom;

    ctx.lineWidth = 1;
    ctx.fillStyle = render.color;
    ctx.strokeStyle = render.color;

    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);

    if (this.#shouldWire(id)) ctx.stroke();
    else ctx.fill();
  }

  #drawAabb(ctx, id, render, pos, box) {
    const minX = pos.x - box.halfWidth + render.offset.x;
    const minY = pos.y - box.halfHeight + render.offset.y;
    const maxX = pos.x + box.halfWidth + render.offset.x;
    const maxY = pos.y + box.halfHeight + render.offset.y;

    const x = this.#sx(minX);
    const yTop = this.#sy(maxY);
    const w = (maxX - minX) * this.#zoom;
    const h = (maxY - minY) * this.#zoom;

    ctx.lineWidth = 1;
    ctx.fillStyle = render.color;
    ctx.strokeStyle = render.color;

    if (this.#shouldWire(id)) ctx.strokeRect(x, yTop, w, h);
    else ctx.fillRect(x, yTop, w, h);
  }

  tick() {
    const em = this.#em;
    const ctx = this.#ctx;
    const z = this.#zoom;

    // oob background
    ctx.fillStyle = this.#cfg.oobBackground;
    ctx.fillRect(0, 0, this.#canvas.width, this.#canvas.height);

    const worldPxW = this.#world.width * z;
    const worldPxH = this.#world.height * z;
    const worldX = this.#ox;
    const worldY = this.#oy - worldPxH;

    // world background
    ctx.fillStyle = this.#cfg.worldBackground;
    ctx.fillRect(worldX, worldY, worldPxW, worldPxH);

    // clip
    if (this.#cfg.clip) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(worldX, worldY, worldPxW, worldPxH);
      ctx.clip();
    }

    // sort into zIndex buckets
    this.#resetBuckets();

    const textRows = em.queryRows('render', 'position', 'text');
    for (const [_, render, pos, text] of textRows) {
      if (!render.visible) continue;
      this.#bucket(render.zIndex).texts.push({ render, pos, text });
    }

    for (const [_, render, c] of em.queryRows('render', 'constraint')) {
      if (!render.visible) continue;
      const a = em.getComponent(c.a, 'position');
      const b = em.getComponent(c.b, 'position');
      if (!a || !b) continue;
      const bucket = this.#bucket(render.zIndex);
      bucket.lines.push({ color: render.color, width: 2, a, b });
    }

    for (const [_, render, s] of em.queryRows('render', 'spring')) {
      if (!render.visible) continue;
      const a = em.getComponent(s.a, 'position');
      const b = em.getComponent(s.b, 'position');
      if (!a || !b) continue;
      const bucket = this.#bucket(render.zIndex);
      bucket.lines.push({ color: render.color, width: 9, a, b });
    }

    const circleRows = em.queryRows('render', 'position', 'circle');
    for (const [id, render, pos, circle] of circleRows) {
      if (!render.visible) continue;
      this.#bucket(render.zIndex).circles.push({ id, render, pos, circle });
    }

    const boxRows = em.queryRows('render', 'position', 'aabb');
    for (const [id, render, pos, box] of boxRows) {
      if (!render.visible) continue;
      this.#bucket(render.zIndex).aabbs.push({ id, render, pos, box });
    }

    // render by zIndex
    const keys = [...this.#bucketKeys].sort((a, b) => a - b);

    for (let ki = 0; ki < keys.length; ki++) {
      const bucket = this.#buckets.get(keys[ki]);

      for (let i = 0; i < bucket.lines.length; i++) {
        const { color, width, a, b } = bucket.lines[i];
        this.#drawLine(ctx, color, width, a, b);
      }

      for (let i = 0; i < bucket.aabbs.length; i++) {
        const { id, render, pos, box } = bucket.aabbs[i];
        this.#drawAabb(ctx, id, render, pos, box);
      }

      for (let i = 0; i < bucket.circles.length; i++) {
        const { id, render, pos, circle } = bucket.circles[i];
        this.#drawCircle(ctx, id, render, pos, circle);
      }

      for (let i = 0; i < bucket.texts.length; i++) {
        const { render, pos, text } = bucket.texts[i];
        this.#drawText(ctx, worldPxW, worldPxH, render, pos, text);
      }
    }

    // restore context
    if (this.#cfg.clip) ctx.restore();
  }
}
