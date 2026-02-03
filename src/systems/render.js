import { getSleep } from '../lib/sleep.js';
import { required } from '../modules/required.js';

export class RenderSystem {
  #cfg = {
    em: required,
    canvas: required,

    clip: true,
    oobBackground: '#111111',
    worldBackground: '#212121',
    wireframe: false,
    debugSleep: false,
  };

  #zoom = 100;
  #ox = 0;
  #oy = 0;
  #buckets = new Map();
  #bucketKeys = new Set();

  constructor(opts) {
    this.configure(opts);
  }

  configure(patch) {
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

  #bucket(zIndex) {
    let b = this.#buckets.get(zIndex);
    if (!b) {
      b = { texts: [], lines: [], circles: [], aabbs: [] };
      this.#buckets.set(zIndex, b);
    }
    this.#bucketKeys.add(zIndex);
    return b;
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

  #shouldWire(id) {
    if (this.#cfg.wireframe) return true;
    if (!this.#cfg.debugSleep) return false;
    return getSleep(this.#cfg.em, id).isSleeping;
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

  #drawCircle(ctx, context, dt, id, render, pos, circle) {
    const x = this.#sx(pos.x + render.offset.x);
    const y = this.#sy(pos.y + render.offset.y);
    const r = circle.radius * this.#zoom;

    ctx.save();
    this.#applySquishX(ctx, id, x, y);
    this.#applySquishY(ctx, context, dt, id, x, y);

    ctx.lineWidth = 1;
    ctx.fillStyle = render.color;
    ctx.strokeStyle = render.color;

    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);

    if (this.#shouldWire(id)) ctx.stroke();
    else ctx.fill();

    const face = this.#cfg.em.getComponent(id, 'face');
    if (face) this.#drawFace(ctx, pos, circle, face);
    ctx.restore();
  }

  #applySquishX(ctx, id, x, y) {
    const em = this.#cfg.em;
    const squish = em.getComponent(id, 'squishX');
    if (!squish?.enabled) return;

    const body = em.getComponent(id, 'body');
    if (!body) return;

    const v = Math.abs(body.vel.x);
    const vEff = Math.max(0, v - squish.deadzone);

    // smoothstep
    const t = Math.min(1, vEff / squish.vRef);
    const tt = t * t * (3 - 2 * t);

    const sx = 1 + squish.amount * tt;
    const sy = 1 / sx;
    ctx.translate(x, y);
    ctx.scale(sx, sy);
    ctx.translate(-x, -y);
  }

  #applySquishY(ctx, context, dt, id, x, y) {
    const em = this.#cfg.em;
    const squish = em.getComponent(id, 'squishY');
    if (!squish?.enabled) return;

    const body = em.getComponent(id, 'body');
    if (!body || !body.preVel) return;

    let grounded = false;
    const collisions = context?.collisions ?? [];
    for (const c of collisions) {
      if (
        (c.a === id && c.normal.y < -0.5) ||
        (c.b === id && c.normal.y > 0.5)
      ) {
        grounded = true;
        break;
      }
    }

    if (grounded && !squish._wasGrounded) {
      if (body.preVel.y < 0) {
        const strength = Math.min(1, -body.preVel.y / squish.vRef);
        const active = squish._t > 0;

        if (!active) {
          squish._strength = strength;
          squish._t = squish.hold;
        } else if (strength > squish._strength) {
          squish._strength = strength;
          squish._t = squish.hold;
        }
      }
    }

    if (squish._t > 0) squish._t = Math.max(0, squish._t - dt);
    else squish._strength = 0;
    squish._wasGrounded = grounded;

    // smoothstep
    const p = squish._t > 0 ? squish._t / squish.hold : 0; // 1..0
    const pp = p * p * (3 - 2 * p);
    const amt = squish.amount * squish._strength * pp;

    const sx = 1 + amt;
    const sy = Math.max(0.35, 1 - amt);
    ctx.translate(x, y);
    ctx.scale(sx, sy);
    ctx.translate(-x, -y);
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

  #drawFace(ctx, pos, circle, face) {
    const baseX = this.#sx(pos.x);
    const baseY = this.#sy(pos.y);
    const rPx = circle.radius * this.#zoom;

    if (face.roll) {
      ctx.save();
      ctx.translate(baseX, baseY);
      ctx.rotate(-face.rollAngle);
      ctx.translate(-baseX, -baseY);
    }

    const oxW = face.nx * face.innerFactor * circle.radius;
    const oyW = face.ny * face.innerFactor * circle.radius;
    const cx = this.#sx(pos.x + oxW);
    const cy = this.#sy(pos.y + oyW);

    // scale size based on radius
    const eyeX = rPx * 0.35;
    const eyeY = rPx * 0.18;
    const eyeR0 = rPx * 0.15;

    const eyeR = face.hover ? eyeR0 * 0.75 : eyeR0;
    const ry = eyeR * (1 - face.blink);

    const drawEye = (x, y) => {
      if (face.hover) {
        ctx.fillStyle = face.white;
        ctx.beginPath();
        ctx.arc(x, y, eyeR + eyeR0 * 0.55, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = face.eyeColor;
      ctx.beginPath();
      ctx.ellipse(x, y, eyeR, ry, 0, 0, Math.PI * 2);
      ctx.fill();
    };

    drawEye(cx - eyeX, cy - eyeY);
    drawEye(cx + eyeX, cy - eyeY);

    ctx.strokeStyle = face.mouthColor;
    ctx.fillStyle = face.mouthColor;
    ctx.lineCap = 'round';
    ctx.lineWidth = rPx * 0.06;

    if (!face.hover) {
      const mw = rPx * 0.38;
      const my = cy + rPx * 0.2;
      ctx.beginPath();
      ctx.moveTo(cx - mw * 0.5, my);
      ctx.lineTo(cx + mw * 0.5, my);
      ctx.stroke();
    } else {
      const mr = rPx * 0.22;
      const my = cy + rPx * 0.18;
      ctx.beginPath();
      ctx.arc(cx, my, mr, 0, Math.PI, false);
      ctx.closePath();
      ctx.fill();
    }

    if (face.roll) ctx.restore();
  }

  resizeCanvas(world) {
    const c = this.#cfg.canvas;
    c.width = c.clientWidth;
    c.height = c.clientHeight;

    const sx = c.width / world.width;
    const sy = c.height / world.height;
    this.#zoom = Math.min(sx, sy);

    const worldPxW = world.width * this.#zoom;
    const worldPxH = world.height * this.#zoom;
    this.#ox = (c.width - worldPxW) / 2;
    this.#oy = (c.height + worldPxH) / 2;
  }

  tick(context, dt) {
    const em = this.#cfg.em;
    const canvas = this.#cfg.canvas;
    const world = context?.world ?? { width: 1, height: 1 };
    const ctx = canvas.getContext('2d');

    if (
      canvas.width !== canvas.clientWidth ||
      canvas.height !== canvas.clientHeight
    ) {
      this.resizeCanvas(world);
    }

    // oob background
    ctx.fillStyle = this.#cfg.oobBackground;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const worldPxW = world.width * this.#zoom;
    const worldPxH = world.height * this.#zoom;
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
        this.#drawCircle(ctx, context, dt, id, render, pos, circle);
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
