import { registry } from '../components/registry.js';
import { clamp } from '../lib/clamp.js';
import { getSleep } from '../lib/sleep.js';
import { required } from '../modules/required.js';
import { Vector } from '../modules/vector.js';

export class PhysicsSystem {
  #cfg = {
    em: required,
    detector: required,

    gravity: new Vector(0, -9.8),
    iterations: 20,
    warmStart: true,
    warmStartFactor: 0.8,
    restitutionThreshold: 0.1,
    baumgarte: 0.2,
    slop: 0.005,
    constraintSlop: 0.01,
    sleep: true,
  };

  #frame = 0;
  #contacts = new Map();

  #emitContact = (a, b, tag, normal, penetration) => {
    const slug = b ?? tag;
    const key = !b || a < b ? `${a}:${slug}` : `${slug}:${a}`;

    const data = this.#contacts.get(key) ?? { a, b, jn: 0, jt: 0, bias: 0 };
    data.bounce = 0;
    data.normal = normal;
    data.penetration = penetration;
    data.seenAt = this.#frame;

    this.#contacts.set(key, data);
  };

  constructor(opts) {
    this.configure(opts);
  }

  configure(patch) {
    if (patch.em && this.#cfg.em) this.reset();
    this.#cfg = { ...this.#cfg, ...patch };
    return this;
  }

  reset() {
    this.#contacts.clear();
    const em = this.#cfg.em;
    for (const id of em.query('constraint')) {
      const c = em.getComponent(id, 'constraint');
      c.impulse = 0;
    }
    return this;
  }

  tick(ctx, dt) {
    // integrate forces / impulses
    this.#integrateForces(dt);
    this.#springForces(dt);
    this.#dragForces(dt);

    // collision detection
    this.#beginContactFrame();
    this.#cfg.detector.detect({ em, ctx, emit: this.#emitContact });
    this.#endContactFrame(ctx);

    // gravity correction + constraints
    this.#correctForGravity(dt);
    this.#updateConstraints();

    // warm start
    if (this.#cfg.warmStart) {
      this.#warmStart();
      this.#warmStartConstraints();
    } else {
      this.#clearAccumulated();
    }

    // sequential impulse
    this.#preSolveBounce();
    for (let i = 0; i < this.#cfg.iterations; i++) {
      this.#solveVelocity();
      this.#solveFriction(dt);
      this.#solvePositionalBias(dt);
      this.#solveConstraintBias(dt);
    }

    // update position + sleep status
    this.#integrateVelocity(dt);
    if (this.#cfg.sleep) {
      this.#updateSleepBodies(dt);
      this.#updateSleepGroups(dt);
    }
  }

  #integrateForces(dt) {
    const em = this.#cfg.em;
    const gravity = this.#cfg.gravity;

    for (const [id, _, body] of em.queryRows('position', 'body')) {
      const sleep = getSleep(em, id);
      if (!body.force.isZero || !body.impulse.isZero) {
        sleep.isSleeping = false;
        sleep.sleepTimer = 0;
      }
      if (sleep.isSleeping) continue;

      body.vel.add(Vector.mul(body.force, body.invMass * dt));
      body.vel.add(Vector.mul(body.impulse, body.invMass));
      body.force.set(0, 0);
      body.impulse.set(0, 0);

      if (body.gravity != null) {
        body.vel.add(Vector.mul(body.gravity, dt));
      } else if (body.invMass !== 0) {
        body.vel.add(Vector.mul(gravity, dt));
      }

      // cache pre-solve velocity
      if (!body.preVel) body.preVel = body.vel.clone();
      else body.preVel.set(body.vel.x, body.vel.y);
    }
  }

  #springForces(dt) {
    const em = this.#cfg.em;
    for (const id of em.query('spring')) {
      const s = em.getComponent(id, 'spring');
      const a = em.getComponent(s.a, 'body');
      const b = em.getComponent(s.b, 'body');
      const aPos = em.getComponent(s.a, 'position');
      const bPos = em.getComponent(s.b, 'position');
      if (!a || !b || !aPos || !bPos) continue;

      const im = a.invMass + b.invMass;
      if (im === 0) continue;

      const d = Vector.sub(bPos, aPos);
      const dist = Math.hypot(d.x, d.y);
      const normal = Vector.div(d, dist);

      const displacement = dist - s.length;
      const force = -displacement * s.spring;
      const dvA = force * a.invMass * dt;
      const dvB = force * b.invMass * dt;

      const sleepA = getSleep(em, s.a);
      const sleepB = getSleep(em, s.b);
      if (!sleepA.isSleeping) a.vel.sub(Vector.mul(normal, dvA));
      if (!sleepB.isSleeping) b.vel.add(Vector.mul(normal, dvB));

      const nv = Vector.sub(b.vel, a.vel).dot(normal);
      const decay = Math.exp(-s.damping * im * dt);
      const nvDamped = nv * decay;
      const j = (-nv + nvDamped) / im;

      if (!sleepA.isSleeping) a.vel.sub(Vector.mul(normal, j * a.invMass));
      if (!sleepB.isSleeping) b.vel.add(Vector.mul(normal, j * b.invMass));
    }
  }

  #dragForces(dt) {
    const em = this.#cfg.em;
    for (const id of em.query('position', 'body')) {
      const body = em.getComponent(id, 'body');
      const sleep = getSleep(em, id);
      if (sleep.isSleeping) continue;

      let quad = Vector.ZERO;
      if (body.quadDrag) {
        const speed = Math.hypot(body.vel.x, body.vel.y);
        quad = Vector.mul(body.vel, -body.quadDrag * speed);
      }
      const linear = Vector.mul(body.vel, -body.linearDrag);
      const force = Vector.add(linear, quad);
      body.vel.add(Vector.mul(force, body.invMass * dt));

      if (body.vxMax != null)
        body.vel.x = clamp(body.vel.x, -body.vxMax, body.vxMax);
      if (body.vyMax != null)
        body.vel.y = clamp(body.vel.y, -body.vyMax, body.vyMax);
    }
  }

  #beginContactFrame() {
    this.#frame += 1;
  }

  #endContactFrame(ctx) {
    const events = ctx?.collisions;
    if (events) events.length = 0;

    for (const [key, c] of this.#contacts) {
      if (c.seenAt !== this.#frame) this.#contacts.delete(key);
      else if (events) events.push(c);
    }
  }

  #correctForGravity(dt) {
    const em = this.#cfg.em;
    const gravity = this.#cfg.gravity;

    for (const c of this.#contacts.values()) {
      const a = em.getComponent(c.a, 'body') ?? registry.body();
      const b = em.getComponent(c.b, 'body') ?? registry.body();

      const im = a.invMass + b.invMass;
      if (im === 0) continue;

      const sleepA = getSleep(em, c.a);
      const sleepB = getSleep(em, c.b);
      const groundScalar = dt * 62.5; // scale unit to percentage per 1/60 of a second

      if (!sleepA.isSleeping && a.vel.dot(c.normal) > 0 && b.invMass === 0) {
        if (a.mu === 0) {
          const g = Vector.mul(a.gravity ?? gravity, dt);
          const gn = g.dot(c.normal);
          a.vel.sub(Vector.mul(c.normal, gn));
        }
        if (c.normal.y < 0) {
          a.vel.x *= 1 - a.groundDrag * groundScalar;
        }
      }

      if (!sleepB.isSleeping && b.vel.dot(c.normal) < 0 && a.invMass === 0) {
        if (b.mu === 0) {
          const g = Vector.mul(b.gravity ?? gravity, dt);
          const gn = g.dot(c.normal);
          b.vel.add(Vector.mul(c.normal, gn));
        }
        if (c.normal.y > 0) {
          b.vel.x *= 1 - b.groundDrag * groundScalar;
        }
      }
    }
  }

  #updateConstraints() {
    const em = this.#cfg.em;
    const constraintSlop = this.#cfg.constraintSlop;

    for (const id of em.query('constraint')) {
      const c = em.getComponent(id, 'constraint');
      const aPos = em.getComponent(c.a, 'position');
      const bPos = em.getComponent(c.b, 'position');
      if (!aPos || !bPos) continue;

      const d = Vector.sub(bPos, aPos);
      const dist = Math.hypot(d.x, d.y);
      c.normal = Vector.div(d, dist);
      c.error = dist - c.dist;

      if (
        (c.mode === 'rope' && c.error <= -constraintSlop) ||
        (c.mode === 'buffer' && c.error >= constraintSlop)
      ) {
        c.impulse = 0;
      }
    }
  }

  #warmStart() {
    const em = this.#cfg.em;
    const warmStartFactor = this.#cfg.warmStartFactor;

    for (const c of this.#contacts.values()) {
      const a = em.getComponent(c.a, 'body');
      const b = em.getComponent(c.b, 'body');
      const sleepA = getSleep(em, c.a);
      const sleepB = getSleep(em, c.b);
      const tangent = new Vector(c.normal.y, -c.normal.x);

      c.bias *= warmStartFactor;
      c.jn *= warmStartFactor;
      c.jt *= warmStartFactor;

      if (!sleepA.isSleeping && a) {
        a.vel.sub(Vector.mul(c.normal, c.bias * a.invMass));
        a.vel.sub(Vector.mul(c.normal, c.jn * a.invMass));
        a.vel.sub(Vector.mul(tangent, c.jt * a.invMass));
      }

      if (!sleepB.isSleeping && b) {
        b.vel.add(Vector.mul(c.normal, c.bias * b.invMass));
        b.vel.add(Vector.mul(c.normal, c.jn * b.invMass));
        b.vel.add(Vector.mul(tangent, c.jt * b.invMass));
      }
    }
  }

  #warmStartConstraints() {
    const em = this.#cfg.em;
    const warmStartFactor = this.#cfg.warmStartFactor;

    for (const id of em.query('constraint')) {
      const c = em.getComponent(id, 'constraint');
      const a = em.getComponent(c.a, 'body');
      const b = em.getComponent(c.b, 'body');
      const sleepA = getSleep(em, c.a);
      const sleepB = getSleep(em, c.b);

      c.impulse *= warmStartFactor;

      if (!sleepA.isSleeping && a)
        a.vel.sub(Vector.mul(c.normal, c.impulse * a.invMass));
      if (!sleepB.isSleeping && b)
        b.vel.add(Vector.mul(c.normal, c.impulse * b.invMass));
    }
  }

  #clearAccumulated() {
    const em = this.#cfg.em;
    for (const c of this.#contacts.values()) {
      c.bias = 0;
      c.jn = 0;
      c.jt = 0;
    }
    for (const id of em.query('constraint')) {
      const c = em.getComponent(id, 'constraint');
      c.impulse = 0;
    }
  }

  #preSolveBounce() {
    const em = this.#cfg.em;
    const thresh = this.#cfg.restitutionThreshold;

    for (const c of this.#contacts.values()) {
      const a = em.getComponent(c.a, 'body') ?? registry.body();
      const b = em.getComponent(c.b, 'body') ?? registry.body();

      const rv = Vector.sub(b.vel, a.vel);
      const vn = rv.dot(c.normal);
      const e = vn < -thresh ? Math.min(a.restitution, b.restitution) : 0;

      c.bounce = -e * vn;
    }
  }

  #solveVelocity() {
    const em = this.#cfg.em;
    for (const c of this.#contacts.values()) {
      const a = em.getComponent(c.a, 'body') ?? registry.body();
      const b = em.getComponent(c.b, 'body') ?? registry.body();

      const im = a.invMass + b.invMass;
      if (im === 0) continue;

      const rv = Vector.sub(b.vel, a.vel);
      const vn = rv.dot(c.normal);
      const dj = (-vn + c.bounce) / im;

      const next = Math.max(c.jn + dj, 0);
      const j = next - c.jn;
      c.jn = next;

      const sleepA = getSleep(em, c.a);
      const sleepB = getSleep(em, c.b);
      if (j > sleepA.wakeThreshold) {
        sleepA.isSleeping = false;
        sleepA.sleepTimer = 0;
      }
      if (j > sleepB.wakeThreshold) {
        sleepB.isSleeping = false;
        sleepB.sleepTimer = 0;
      }

      if (!sleepA.isSleeping) a.vel.sub(Vector.mul(c.normal, j * a.invMass));
      if (!sleepB.isSleeping) b.vel.add(Vector.mul(c.normal, j * b.invMass));
    }
  }

  #solveFriction() {
    const em = this.#cfg.em;
    for (const c of this.#contacts.values()) {
      const a = em.getComponent(c.a, 'body') || registry.body();
      const b = em.getComponent(c.b, 'body') || registry.body();
      if (!a.mu || (c.b && !b.mu)) continue;

      const im = a.invMass + b.invMass;
      if (im === 0) continue;

      const rv = Vector.sub(b.vel, a.vel);
      const tangent = new Vector(c.normal.y, -c.normal.x);
      const vt = rv.dot(tangent);
      const dj = -vt / im;

      const mu = a.mu * (c.b ? b.mu : a.mu);
      const next = clamp(c.jt + dj, -mu * c.jn, mu * c.jn);
      const jt = next - c.jt;
      c.jt = next;

      const sleepA = getSleep(em, c.a);
      const sleepB = getSleep(em, c.b);
      if (!sleepA.isSleeping) a.vel.sub(Vector.mul(tangent, jt * a.invMass));
      if (!sleepB.isSleeping) b.vel.add(Vector.mul(tangent, jt * b.invMass));
    }
  }

  #solvePositionalBias(dt) {
    const em = this.#cfg.em;
    const slop = this.#cfg.slop;
    const baumgarte = this.#cfg.baumgarte;

    for (const c of this.#contacts.values()) {
      if (c.penetration < slop) continue;
      const a = em.getComponent(c.a, 'body') ?? registry.body();
      const b = em.getComponent(c.b, 'body') ?? registry.body();

      const im = a.invMass + b.invMass;
      if (im === 0) continue;

      const rv = Vector.sub(b.vel, a.vel);
      const vn = rv.dot(c.normal);
      const correction = c.penetration - slop;
      const bias = (baumgarte * correction) / dt;
      const dj = (-vn + bias) / im;

      const next = Math.max(c.bias + dj, 0);
      const j = next - c.bias;
      c.bias = next;

      const sleepA = getSleep(em, c.a);
      const sleepB = getSleep(em, c.b);
      if (!sleepA.isSleeping) a.vel.sub(Vector.mul(c.normal, j * a.invMass));
      if (!sleepB.isSleeping) b.vel.add(Vector.mul(c.normal, j * b.invMass));
    }
  }

  #solveConstraintBias(dt) {
    const em = this.#cfg.em;
    for (const id of em.query('constraint')) {
      const c = em.getComponent(id, 'constraint');
      const a = em.getComponent(c.a, 'body');
      const b = em.getComponent(c.b, 'body');
      if (!a || !b) continue;

      const im = a.invMass + b.invMass;
      if (im === 0) continue;
      if (c.mode === 'rope' && c.error <= 0) continue;
      if (c.mode === 'buffer' && c.error >= 0) continue;

      const rv = Vector.sub(b.vel, a.vel);
      const vn = rv.dot(c.normal);
      const bias = (-c.error * c.stiffness) / dt;
      const dj = (-vn + bias) / im;

      let next = c.impulse + dj;
      if (c.mode === 'rope') {
        next = Math.min(next, 0);
      } else if (c.mode === 'buffer') {
        next = Math.max(next, 0);
      }
      const j = next - c.impulse;
      c.impulse = next;

      const sleepA = getSleep(em, c.a);
      const sleepB = getSleep(em, c.b);
      if (!sleepA.isSleeping) a.vel.sub(Vector.mul(c.normal, j * a.invMass));
      if (!sleepB.isSleeping) b.vel.add(Vector.mul(c.normal, j * b.invMass));
    }
  }

  #integrateVelocity(dt) {
    const em = this.#cfg.em;
    for (const [id, pos, body] of em.queryRows('position', 'body')) {
      const sleep = getSleep(em, id);
      if (sleep.isSleeping) continue;
      pos.add(Vector.mul(body.vel, dt));
    }
  }

  #updateSleepBodies(dt) {
    const em = this.#cfg.em;
    const rows = em.queryRows('position', 'body', 'sleep');

    for (const [_, __, body, sleep] of rows) {
      if (sleep.isSleeping) continue;

      if (body.vel.lengthSq() < sleep.sleepThreshold * sleep.sleepThreshold) {
        sleep.sleepTimer += dt;
      } else {
        sleep.sleepTimer = 0;
      }

      if (sleep.sleepTimer >= sleep.timeToSleep) {
        sleep.isSleeping = true;
        sleep.sleepTimer = 0;
      }
    }
  }

  #updateSleepGroups(dt) {
    const em = this.#cfg.em;
    for (const [_, sleep, group] of em.queryRows('sleep', 'group')) {
      if (sleep.isSleeping) continue;

      let maxV = 0;
      for (const id of group) {
        const body = em.getComponent(id, 'body') ?? registry.body();
        maxV = Math.max(maxV, body.vel.lengthSq());
      }

      if (maxV < sleep.sleepThreshold * sleep.sleepThreshold) {
        sleep.sleepTimer += dt;
      } else {
        sleep.sleepTimer = 0;
      }

      if (sleep.sleepTimer >= sleep.timeToSleep) {
        sleep.isSleeping = true;
        sleep.sleepTimer = 0;
      }
    }
  }
}
