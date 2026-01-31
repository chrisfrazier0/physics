export class KeyboardSystem {
  #down = new Set();
  #pressed = new Set();
  #released = new Set();
  #dirty = new Set();

  #keyboard;

  #onKeyDown = (e) => {
    const k = e.code;
    if (!this.#down.has(k)) {
      this.#down.add(k);
      this.#pressed.add(k);
      this.#dirty.add(k);
    }
  };

  #onKeyUp = (e) => {
    const k = e.code;
    if (this.#down.has(k)) {
      this.#down.delete(k);
      this.#released.add(k);
      this.#dirty.add(k);
    }
  };

  constructor({ em, worldId }) {
    this.#keyboard = em.getComponent(worldId, 'keyboard');

    window.addEventListener('keydown', this.#onKeyDown);
    window.addEventListener('keyup', this.#onKeyUp);
  }

  destroy() {
    window.removeEventListener('keydown', this.#onKeyDown);
    window.removeEventListener('keyup', this.#onKeyUp);
  }

  tick() {
    const keys = this.#keyboard;
    for (const k of this.#dirty) {
      let state = keys.get(k);
      if (!state) {
        state = { down: false, pressed: false, released: false };
        keys.set(k, state);
      }

      state.down = this.#down.has(k);
      state.pressed = this.#pressed.has(k);
      state.released = this.#released.has(k);

      // keep dirty one extra frame to clear one-frame flags
      if (!state.pressed && !state.released) this.#dirty.delete(k);
    }

    this.#pressed.clear();
    this.#released.clear();
  }
}
