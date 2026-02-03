export class PointerSystem {
  #px = 0;
  #py = 0;
  #dirty = false;

  #canvas;

  #onMove = (e) => {
    const r = this.#canvas.getBoundingClientRect();
    this.#px = e.clientX - r.left;
    this.#py = e.clientY - r.top;
    this.#dirty = true;
  };

  constructor({ canvas }) {
    this.#canvas = canvas;
    window.addEventListener('mousemove', this.#onMove);
  }

  destroy() {
    window.removeEventListener('mousemove', this.#onMove);
  }

  tick(ctx) {
    if (!ctx?.pointer) return;

    const canvas = this.#canvas;
    const world = ctx.world ?? { width: 1, height: 1 };

    const w = canvas.width;
    const h = canvas.height;
    const zoom = Math.min(w / world.width, h / world.height);

    const worldPxW = world.width * zoom;
    const worldPxH = world.height * zoom;

    const ox = (w - worldPxW) / 2;
    const oy = (h + worldPxH) / 2;

    const inside =
      this.#px >= ox &&
      this.#px <= ox + worldPxW &&
      this.#py >= oy - worldPxH &&
      this.#py <= oy;

    ctx.pointer.inside = inside;

    if (!this.#dirty) return;
    this.#dirty = false;

    ctx.pointer.px = this.#px;
    ctx.pointer.py = this.#py;
    ctx.pointer.x = (this.#px - ox) / zoom;
    ctx.pointer.y = (oy - this.#py) / zoom;
  }
}
