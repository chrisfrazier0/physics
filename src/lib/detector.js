import { Vector } from '../modules/vector.js';
import { WorldBoundary } from './boundary.js';
import { clamp } from './clamp.js';

const defaults = {
  boundary: WorldBoundary.ALL,
  boundaryLayer: 1,
};

export class BruteForceDetector {
  #boundary;
  #boundaryLayer;

  constructor(opts = {}) {
    const cfg = { ...defaults, ...opts };
    this.#boundary = cfg.boundary;
    this.#boundaryLayer = cfg.boundaryLayer;
  }

  detect({ em, world, emit }) {
    const ids = [...em.query('position', 'collider')];
    for (let i = 0; i < ids.length; i++) {
      const a = ids[i];
      const colA = em.getComponent(a, 'collider');

      if (colA.type === 'circle') this.#circleBoundary(em, world, emit, a);
      if (colA.type === 'aabb') this.#aabbBoundary(em, world, emit, a);

      for (let j = i + 1; j < ids.length; j++) {
        const b = ids[j];
        const colB = em.getComponent(b, 'collider');

        if ((colA.mask & colB.layer) === 0 || (colB.mask & colA.layer) === 0) {
          continue;
        }

        if (colA.type === 'circle' && colB.type === 'circle') {
          this.#circleCircle(em, emit, a, b);
        } else if (colA.type === 'aabb' && colB.type === 'aabb') {
          this.#aabbAabb(em, emit, a, b);
        } else if (colA.type === 'circle' && colB.type === 'aabb') {
          this.#circleAabb(em, emit, a, b);
        } else if (colA.type === 'aabb' && colB.type === 'circle') {
          this.#circleAabb(em, emit, b, a);
        }
      }
    }
  }

  #circleBoundary(em, world, emit, id) {
    const boundary = this.#boundary;
    const boundaryLayer = this.#boundaryLayer;

    const col = em.getComponent(id, 'collider');
    const pos = em.getComponent(id, 'position');
    const r = em.getComponent(id, 'circle')?.radius;

    if (r == null || !(col.mask & boundaryLayer)) return;

    if (boundary & WorldBoundary.FLOOR) {
      const pen = r - pos.y;
      if (pen >= 0) emit(id, null, 'floor', Vector.DOWN, pen);
    }
    if (boundary & WorldBoundary.CEILING) {
      const pen = pos.y + r - world.height;
      if (pen >= 0) emit(id, null, 'ceiling', Vector.UP, pen);
    }
    if (boundary & WorldBoundary.LEFT) {
      const pen = r - pos.x;
      if (pen >= 0) emit(id, null, 'left', Vector.LEFT, pen);
    }
    if (boundary & WorldBoundary.RIGHT) {
      const pen = pos.x + r - world.width;
      if (pen >= 0) emit(id, null, 'right', Vector.RIGHT, pen);
    }
  }

  #aabbBoundary(em, world, emit, id) {
    const boundary = this.#boundary;
    const boundaryLayer = this.#boundaryLayer;

    const col = em.getComponent(id, 'collider');
    const pos = em.getComponent(id, 'position');
    const box = em.getComponent(id, 'aabb');

    if (!box || !(col.mask & boundaryLayer)) return;

    const minX = pos.x - box.halfWidth;
    const maxX = pos.x + box.halfWidth;
    const minY = pos.y - box.halfHeight;
    const maxY = pos.y + box.halfHeight;

    if (boundary & WorldBoundary.FLOOR) {
      const pen = -minY;
      if (pen >= 0) emit(id, null, 'floor', Vector.DOWN, pen);
    }
    if (boundary & WorldBoundary.CEILING) {
      const pen = maxY - world.height;
      if (pen >= 0) emit(id, null, 'ceiling', Vector.UP, pen);
    }
    if (boundary & WorldBoundary.LEFT) {
      const pen = -minX;
      if (pen >= 0) emit(id, null, 'left', Vector.LEFT, pen);
    }
    if (boundary & WorldBoundary.RIGHT) {
      const pen = maxX - world.width;
      if (pen >= 0) emit(id, null, 'right', Vector.RIGHT, pen);
    }
  }

  #circleCircle(em, emit, a, b) {
    const aPos = em.getComponent(a, 'position');
    const rA = em.getComponent(a, 'circle')?.radius;
    const bPos = em.getComponent(b, 'position');
    const rB = em.getComponent(b, 'circle')?.radius;
    if (rA == null || rB == null) return;

    const d = Vector.sub(bPos, aPos);
    const dist2 = d.lengthSq();
    const r = rA + rB;

    if (dist2 <= r * r) {
      const dist = Math.sqrt(dist2);
      const pen = r - dist;
      const normal = Vector.div(d, dist);
      emit(a, b, null, normal, pen);
    }
  }

  #aabbAabb(em, emit, a, b) {
    const aPos = em.getComponent(a, 'position');
    const aBox = em.getComponent(a, 'aabb');
    const bPos = em.getComponent(b, 'position');
    const bBox = em.getComponent(b, 'aabb');
    if (!aBox || !bBox) return;

    const dx = bPos.x - aPos.x;
    const px = aBox.halfWidth + bBox.halfWidth - Math.abs(dx);
    if (px < 0) return;

    const dy = bPos.y - aPos.y;
    const py = aBox.halfHeight + bBox.halfHeight - Math.abs(dy);
    if (py < 0) return;

    if (px <= py) {
      const normal = dx < 0 ? Vector.LEFT : Vector.RIGHT;
      emit(a, b, null, normal, px);
    } else {
      const normal = dy < 0 ? Vector.DOWN : Vector.UP;
      emit(a, b, null, normal, py);
    }
  }

  #circleAabb(em, emit, circleId, aabbId) {
    const cPos = em.getComponent(circleId, 'position');
    const cBody = em.getComponent(circleId, 'body');
    const r = em.getComponent(circleId, 'circle')?.radius;

    const bPos = em.getComponent(aabbId, 'position');
    const box = em.getComponent(aabbId, 'aabb');

    if (r == null || !box) return;

    const minX = bPos.x - box.halfWidth;
    const maxX = bPos.x + box.halfWidth;
    const minY = bPos.y - box.halfHeight;
    const maxY = bPos.y + box.halfHeight;

    const closestX = clamp(cPos.x, minX, maxX);
    const closestY = clamp(cPos.y, minY, maxY);
    const d = new Vector(closestX - cPos.x, closestY - cPos.y);
    const dist2 = d.lengthSq();

    // circle outside
    if (dist2 > 0) {
      if (dist2 > r * r) return;

      const dist = Math.sqrt(dist2);
      const pen = r - dist;
      const normal = Vector.div(d, dist);
      emit(circleId, aabbId, null, normal, pen);
      return;
    }

    // circle inside (or touching edge)
    let normal;
    if (cBody) {
      const vx = cBody.vel.x;
      const vy = cBody.vel.y;

      const epsilon = 1e-5;
      if (Math.abs(vx) > Math.abs(vy)) {
        if (Math.abs(vx) > epsilon) {
          normal = vx > 0 ? Vector.RIGHT : Vector.LEFT;
        }
      } else if (Math.abs(vy) > epsilon) {
        normal = vy > 0 ? Vector.UP : Vector.DOWN;
      }
    }

    if (!normal) {
      const dx = cPos.x - bPos.x;
      const dy = cPos.y - bPos.y;
      const ox = box.halfWidth - Math.abs(dx);
      const oy = box.halfHeight - Math.abs(dy);

      if (ox < oy) {
        normal = dx > 0 ? Vector.RIGHT : Vector.LEFT;
      } else {
        normal = dy > 0 ? Vector.UP : Vector.DOWN;
      }
    }

    let pen;
    if (normal === Vector.LEFT) pen = r + (cPos.x - minX);
    else if (normal === Vector.RIGHT) pen = r + (maxX - cPos.x);
    else if (normal === Vector.DOWN) pen = r + (cPos.y - minY);
    else pen = r + (maxY - cPos.y);

    emit(circleId, aabbId, null, normal, pen);
  }
}
