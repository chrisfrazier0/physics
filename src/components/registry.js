import { Vector } from '../modules/vector.js';

export const registry = {
  position: (v = new Vector(0, 0)) =>
    v instanceof Vector ? v : new Vector(v.x ?? 0, v.y ?? 0),

  body: (o = {}) => ({
    gravity: null,
    vel: new Vector(0, 0),
    vxMax: null,
    vyMax: null,
    invMass: 0,
    restitution: 1,
    groundDrag: 0,
    mu: 0,
    linearDrag: 0,
    quadDrag: 0,
    force: new Vector(0, 0),
    impulse: new Vector(0, 0),
    ...o,
  }),

  collider: (o = {}) => ({
    type: 'circle', // 'circle' | 'aabb'
    layer: 1,
    mask: 65535,
    ...o,
  }),

  circle: (o = {}) => ({
    radius: 1,
    ...o,
  }),

  aabb: (o = {}) => ({
    halfWidth: 1,
    halfHeight: 1,
    ...o,
  }),

  text: (o = {}) => ({
    value: 'Lorem Ipsum',
    size: 16,
    weight: 400, // 400 | 500 | 600 | 700 | 'bold'
    font: 'ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial',
    align: 'center', // 'left' | 'center' | 'right'
    baseline: 'middle', // 'top' | 'hanging' | 'middle' | 'alphabetic' | 'ideographic' | 'bottom'
    alpha: 0.55,
    fit: false,
    pad: 0.08,
    ...o,
  }),

  render: (o = {}) => ({
    visible: true,
    offset: new Vector(0, 0),
    color: '#AAAAAA',
    zIndex: 1,
    ...o,
  }),

  sleep: (o = {}) => ({
    isSleeping: false,
    sleepTimer: 0,
    timeToSleep: 0.5,
    sleepThreshold: 0.05,
    wakeThreshold: 0.007,
    ...o,
  }),

  group: (g = new Set()) => g,

  groupRef: (ref = -1) => ref,

  constraint: (o = {}) => ({
    mode: 'rod', // 'rod' | 'rope' | 'buffer'
    a: null,
    b: null,
    dist: 1,
    stiffness: 0.8,
    normal: Vector.RIGHT,
    error: 0,
    impulse: 0,
    ...o,
  }),

  spring: (o = {}) => ({
    a: null,
    b: null,
    length: 1,
    spring: 1,
    damping: 0,
    ...o,
  }),
};
