const defaults = {
  timestep: 1 / 60,
  panicThreshold: 100,
};

export class Scheduler {
  #fixed = [];
  #frame = [];

  #running = false;
  #resumeOnVisible = false;
  #rafId = null;
  #lastFrameMs = 0;
  #delta = 0;

  #timestep;
  #panicThreshold;

  tick = (ts) => {
    if (!this.#running) return;

    const lastFrameMs = this.#lastFrameMs || ts;
    const dt = (ts - lastFrameMs) / 1000;
    this.#lastFrameMs = ts;
    this.#delta += dt;

    let count = 0;
    while (this.#delta >= this.#timestep) {
      this.#fixed.forEach((system) => system.tick(this.#timestep));
      this.#delta -= this.#timestep;

      if (++count >= this.#panicThreshold) {
        this.#panic();
        break;
      }
    }

    this.#frame.forEach((system) => system.tick(ts));
    this.#rafId = requestAnimationFrame(this.tick);
  };

  #onVisibilityChange = () => {
    if (document.hidden) {
      this.#resumeOnVisible = this.#running;
      if (this.#running) this.stop();
    } else if (this.#resumeOnVisible) {
      this.#resumeOnVisible = false;
      this.start();
    }
  };

  constructor(opts = {}) {
    const cfg = { ...defaults, ...opts };
    this.#timestep = cfg.timestep;
    this.#panicThreshold = cfg.panicThreshold;

    document.addEventListener('visibilitychange', this.#onVisibilityChange);
  }

  destroy() {
    document.removeEventListener('visibilitychange', this.#onVisibilityChange);
  }

  fixedSystem(system) {
    this.#fixed.push(system);
    return this;
  }

  frameSystem(system) {
    this.#frame.push(system);
    return this;
  }

  start() {
    if (!this.#running) {
      this.#lastFrameMs = 0;
      this.#delta = 0;
      this.#rafId = requestAnimationFrame(this.tick);
      this.#running = true;
    }
    return this;
  }

  stop() {
    if (this.#rafId !== null) {
      cancelAnimationFrame(this.#rafId);
      this.#rafId = null;
    }
    this.#running = false;
    return this;
  }

  #panic() {
    console.warn('Potential spiral, dropping delta time...');
    this.#lastFrameMs = 0;
    this.#delta = 0;
  }
}
