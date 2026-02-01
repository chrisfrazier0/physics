const epsilon = 1e-12;
const FALLBACK_NORMAL = { x: 0, y: 1 };

export class Vector {
  static ZERO = Object.freeze(new Vector(0, 0));
  static ONE = Object.freeze(new Vector(1, 1));
  static UP = Object.freeze(new Vector(0, 1));
  static DOWN = Object.freeze(new Vector(0, -1));
  static LEFT = Object.freeze(new Vector(-1, 0));
  static RIGHT = Object.freeze(new Vector(1, 0));

  constructor(x, y) {
    this.set(x, y);
  }

  set(x, y) {
    this.x = x;
    this.y = y;
    return this;
  }

  get isZero() {
    return this.x === 0 && this.y === 0;
  }

  add(other) {
    this.x += other.x;
    this.y += other.y;
    return this;
  }

  static add(a, b) {
    return new Vector(a.x + b.x, a.y + b.y);
  }

  sub(other) {
    this.x -= other.x;
    this.y -= other.y;
    return this;
  }

  static sub(a, b) {
    return new Vector(a.x - b.x, a.y - b.y);
  }

  mul(scalar) {
    this.x *= scalar;
    this.y *= scalar;
    return this;
  }

  static mul(a, scalar) {
    return new Vector(a.x * scalar, a.y * scalar);
  }

  div(scalar) {
    if (scalar > epsilon) {
      this.x /= scalar;
      this.y /= scalar;
    } else {
      this.set(FALLBACK_NORMAL.x, FALLBACK_NORMAL.y);
    }
    return this;
  }

  static div(a, scalar) {
    if (scalar > epsilon) {
      return new Vector(a.x / scalar, a.y / scalar);
    }
    return new Vector(FALLBACK_NORMAL.x, FALLBACK_NORMAL.y);
  }

  normalize() {
    const hypot = Math.hypot(this.x, this.y);
    return this.div(hypot);
  }

  static normalize(a) {
    const hypot = Math.hypot(a.x, a.y);
    return Vector.div(a, hypot);
  }

  lengthSq() {
    return this.x * this.x + this.y * this.y;
  }

  dot(other) {
    return this.x * other.x + this.y * other.y;
  }
}
