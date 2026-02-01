export class KeyboardSystem {
  #down = new Set();
  #pressed = new Set();
  #released = new Set();
  #dirty = new Set();

  state = new Map();

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

  #onBlur = () => this.reset();

  constructor() {
    window.addEventListener('keydown', this.#onKeyDown);
    window.addEventListener('keyup', this.#onKeyUp);
    window.addEventListener('blur', this.#onBlur);
    document.addEventListener('visibilitychange', this.#onBlur);
  }

  destroy() {
    window.removeEventListener('keydown', this.#onKeyDown);
    window.removeEventListener('keyup', this.#onKeyUp);
    window.removeEventListener('blur', this.#onBlur);
    document.removeEventListener('visibilitychange', this.#onBlur);
  }

  reset() {
    this.#down.clear();
    this.#pressed.clear();
    this.#released.clear();
    this.#dirty.clear();
    this.state.clear();
    return this;
  }

  tick() {
    for (const k of this.#dirty) {
      let s = this.state.get(k);
      if (!s) {
        s = { down: false, pressed: false, released: false };
        this.state.set(k, s);
      }

      s.down = this.#down.has(k);
      s.pressed = this.#pressed.has(k);
      s.released = this.#released.has(k);

      // keep dirty one extra tick to clear pressed/released
      if (!s.pressed && !s.released) this.#dirty.delete(k);
    }

    this.#pressed.clear();
    this.#released.clear();
  }

  down(code) {
    return this.#down.has(code);
  }

  pressed(code) {
    return this.state.get(code)?.pressed === true;
  }

  released(code) {
    return this.state.get(code)?.released === true;
  }
}
