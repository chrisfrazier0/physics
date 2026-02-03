export class Scene {
  blocksInput = false;
  blocksUpdate = false;
  opaque = false;

  inputDisabled = false;

  #frame = [];
  #fixed = [];
  #render = [];

  constructor(opts = {}) {
    this.blocksInput = opts.blocksInput ?? this.blocksInput;
    this.blocksUpdate = opts.blocksUpdate ?? this.blocksUpdate;
    this.opaque = opts.opaque ?? this.opaque;
  }

  addFrame(sys)  { this.#frame.push(sys);  return this; }
  addFixed(sys)  { this.#fixed.push(sys);  return this; }
  addRender(sys) { this.#render.push(sys); return this; }

  removeFrame(sys)  { this.#removeAll(this.#frame, sys);  return this; }
  removeFixed(sys)  { this.#removeAll(this.#fixed, sys);  return this; }
  removeRender(sys) { this.#removeAll(this.#render, sys); return this; }

  clearFrame()  { this.#frame.length  = 0; return this; }
  clearFixed()  { this.#fixed.length  = 0; return this; }
  clearRender() { this.#render.length = 0; return this; }

  onFrame(ctx, dt)  { this.frameInput(ctx, dt);  this.frameTick(ctx, dt);  }
  onFixed(ctx, dt)  { this.fixedInput(ctx, dt);  this.fixedTick(ctx, dt);  }
  onRender(ctx, dt) { this.renderInput(ctx, dt); this.renderTick(ctx, dt); }

  frameInput(ctx, dt)  { this.#input(this.#frame,  ctx, dt); }
  fixedInput(ctx, dt)  { this.#input(this.#fixed,  ctx, dt); }
  renderInput(ctx, dt) { this.#input(this.#render, ctx, dt); }

  frameTick(ctx, dt)   { this.#tick(this.#frame,  ctx, dt); }
  fixedTick(ctx, dt)   { this.#tick(this.#fixed,  ctx, dt); }
  renderTick(ctx, dt)  { this.#tick(this.#render, ctx, dt); }

  #input(list, ctx, dt) {
    if (this.inputDisabled === true) return;
    for (const sys of list) {
      if (sys.enabled !== false) sys.input?.(ctx, dt);
    }
  }

  #tick(list, ctx, dt) {
    for (const sys of list) {
      if (sys.enabled !== false) sys.tick?.(ctx, dt);
    }
  }

  #removeAll(list, sys) {
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i] === sys) list.splice(i, 1);
    }
  }
}
