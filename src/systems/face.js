import { required } from '../modules/required.js';

export class FaceSystem {
  #cfg = {
    em: required,
  };

  constructor(opts) {
    this.configure(opts);
  }

  configure(patch) {
    this.#cfg = { ...this.#cfg, ...patch };
    return this;
  }

  tick(ctx, dt) {
    const em = this.#cfg.em;
    const pointer = ctx?.pointer;
    if (!pointer) return;

    const faces = em.queryRows('position', 'circle', 'face');
    for (const [id, pos, circle, face] of faces) {
      const r = circle.radius;

      if (face.roll) {
        const body = em.getComponent(id, 'body');
        if (body) {
          const omega = -(body.vel.x / r) * face.rollFactor;
          face.rollAngle += omega * dt;

          const twoPi = Math.PI * 2;
          if (face.rollAngle > twoPi || face.rollAngle < -twoPi) {
            face.rollAngle = ((face.rollAngle % twoPi) + twoPi) % twoPi;
          }
        }
      }

      const dx = pointer.x - pos.x;
      const dy = pointer.y - pos.y;

      let tx = dx / r;
      let ty = dy / r;

      const theta = face.roll ? face.rollAngle : 0;
      if (theta !== 0) {
        const c = Math.cos(theta);
        const s = Math.sin(theta);

        // rotate world vector by -theta (world -> face local)
        const lx = c * tx + s * ty;
        const ly = -s * tx + c * ty;
        tx = lx;
        ty = ly;
      }

      const len = Math.hypot(tx, ty);
      if (len > face.maxN) {
        const s = face.maxN / len;
        tx *= s;
        ty *= s;
      }

      const a = 1 - Math.exp(-face.ease * dt);
      face.nx += (tx - face.nx) * a;
      face.ny += (ty - face.ny) * a;

      face.hover = pointer.inside && dx * dx + dy * dy <= r * r;
      face.blinkT += dt;

      const phase = face.blinkT % face.blinkPeriod;
      const dur = face.blinkDur;

      if (phase < dur) {
        // triangular pulse
        const half = dur * 0.5;
        const d = Math.abs(phase - half);
        face.blink = 1 - d / half;
      } else {
        face.blink = 0;
      }
    }
  }
}
