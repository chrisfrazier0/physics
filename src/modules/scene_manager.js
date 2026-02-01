import { Scene } from './scene.js';

export class SceneManager extends Scene {
  #stack = [];
  #ops = [];

  top() {
    return this.#stack[this.#stack.length - 1];
  }

  push(scene) {
    this.#stack.push(scene);
    scene.create?.();
    return scene;
  }

  pop() {
    const scene = this.#stack.pop();
    if (!scene) return;
    scene.destroy?.();
    return scene;
  }

  replace(scene) {
    this.pop();
    return this.push(scene);
  }

  pushLater(scene) {
    this.#ops.push(() => this.push(scene));
    return scene;
  }

  popLater() {
    this.#ops.push(() => this.pop());
    return this;
  }

  replaceLater(scene) {
    this.#ops.push(() => this.replace(scene));
    return scene;
  }

  flush() {
    if (this.#ops.length !== 0) {
      const ops = this.#ops;
      this.#ops = [];
      for (const op of ops) op();
    }
    return this;
  }

  onFrame(ctx, dt) {
    super.onFrame(ctx, dt);
    this.#dispatch('frameInput', 'blocksInput', ctx, dt);
    this.#dispatch('frameTick', 'blocksUpdate', ctx, dt);
    this.flush();
    return this;
  }

  onFixed(ctx, dt) {
    super.onFixed(ctx, dt);
    this.#dispatch('fixedInput', 'blocksInput', ctx, dt);
    this.#dispatch('fixedTick', 'blocksUpdate', ctx, dt);
    this.flush();
    return this;
  }

  onRender(ctx, dt) {
    super.onRender(ctx, dt);
    this.#dispatch('renderInput', 'blocksInput', ctx, dt);
    this.#dispatch('renderTick', 'opaque', ctx, dt);
    this.flush();
    return this;
  }

  #findStartFromTop(flagName) {
    for (let i = this.#stack.length - 1; i >= 0; i--) {
      const s = this.#stack[i];
      if (s.enabled === false) continue;
      if (s[flagName]) return i;
    }
    return 0;
  }

  #dispatch(method, flag, ctx, dt) {
    if (this.#stack.length === 0) return;

    const start = this.#findStartFromTop(flag);
    for (let i = start; i < this.#stack.length; i++) {
      const s = this.#stack[i];
      if (s.enabled !== false) s[method]?.(ctx, dt);
    }
  }
}
