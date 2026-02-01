export class Scheduler {
  #cfg = {
    timestep: 1 / 60,
    panicThreshold: 100,
    ctx: null,
  };

  #running = false;
  #resumeOnVisible = false;
  #task = null;
  #rafId = null;
  #lastFrameMs = 0;
  #delta = 0;

  tick = (ts) => {
    if (!this.#running || !this.#task) return;

    const lastFrameMs = this.#lastFrameMs || ts;
    const dt = (ts - lastFrameMs) / 1000;
    this.#lastFrameMs = ts;
    this.#delta += dt;

    const ctx = this.#cfg.ctx;
    const time = ctx?.time;
    if (time) time.frameTime += dt;
    this.#task.onFrame?.(ctx, dt);

    let count = 0;
    const timestep = this.#cfg.timestep;
    while (this.#delta >= timestep) {
      if (time) time.fixedTime += timestep;
      this.#task.onFixed?.(ctx, timestep);

      this.#delta -= timestep;
      if (++count >= this.#cfg.panicThreshold) {
        this.#panic();
        break;
      }
    }

    this.#task.onRender?.(ctx, dt);
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
    this.configure(opts);
    document.addEventListener('visibilitychange', this.#onVisibilityChange);
  }

  destroy() {
    this.stop();
    document.removeEventListener('visibilitychange', this.#onVisibilityChange);
  }

  configure(patch) {
    this.#cfg = { ...this.#cfg, ...patch };
    return this;
  }

  start(task = null) {
    const newTask = task ?? this.#task;
    if (this.#task !== newTask) this.stop();
    this.#task = newTask;

    if (!this.#task) {
      throw new Error('no animation task provided');
    }

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
