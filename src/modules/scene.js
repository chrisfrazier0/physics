export class Scene {
  enabled = true;

  blocksInput = false;
  blocksUpdate = false;
  opaque = false;

  create() {}
  destroy() {}

  onEnter() {}
  onExit() {}
  onCovered() {}
  onUncovered() {}

  input(kb) {}
  fixed(dt) {}
  frame(ts) {}
  render() {}
}

export class SceneManager {
  #stack = [];
  #pending = [];

  top() {
    return this.#stack[this.#stack.length - 1];
  }

  push(scene) {
    const prevTop = this.top();
    if (prevTop) prevTop.onCovered?.();

    this.#stack.push(scene);
    scene.create?.();
    scene.onEnter?.();

    return scene;
  }

  pop() {
    const scene = this.#stack.pop();
    if (!scene) return;

    scene.onExit?.();
    scene.destroy?.();

    const newTop = this.top();
    if (newTop) newTop.onUncovered?.();

    return scene;
  }

  replace(scene) {
    this.pop();
    return this.push(scene);
  }

  pushLater(scene) {
    this.#pending.push(() => this.push(scene));
    return scene;
  }

  popLater() {
    this.#pending.push(() => this.pop());
  }

  replaceLater(scene) {
    this.#pending.push(() => this.replace(scene));
    return scene;
  }

  flush() {
    while (this.#pending.length) {
      const op = this.#pending.shift();
      op();
    }
    return this;
  }

  input(kb) {
    for (let i = this.#stack.length - 1; i >= 0; i--) {
      const s = this.#stack[i];
      if (!s.enabled) continue;
      s.input?.(kb);

      if (s.blocksInput) break;
    }
    return this;
  }

  fixed(dt) {
    if (this.#stack.length === 0) return;

    let start = 0;
    for (let i = this.#stack.length - 1; i >= 0; i--) {
      const s = this.#stack[i];
      if (!s.enabled) continue;
      if (s.blocksUpdate) {
        start = i;
        break;
      }
    }

    for (let i = start; i < this.#stack.length; i++) {
      const s = this.#stack[i];
      if (!s.enabled) continue;
      s.fixed?.(dt);
    }
    return this;
  }

  frame(ts) {
    if (this.#stack.length === 0) return;

    let start = 0;
    for (let i = this.#stack.length - 1; i >= 0; i--) {
      const s = this.#stack[i];
      if (!s.enabled) continue;
      if (s.blocksUpdate) {
        start = i;
        break;
      }
    }

    for (let i = start; i < this.#stack.length; i++) {
      const s = this.#stack[i];
      if (!s.enabled) continue;
      s.frame?.(ts);
    }
    return this;
  }

  render() {
    if (this.#stack.length === 0) return;

    let start = 0;
    for (let i = this.#stack.length - 1; i >= 0; i--) {
      const s = this.#stack[i];
      if (!s.enabled) continue;
      if (s.opaque) {
        start = i;
        break;
      }
    }

    for (let i = start; i < this.#stack.length; i++) {
      const s = this.#stack[i];
      if (!s.enabled) continue;
      s.render?.();
    }
    return this;
  }
}
