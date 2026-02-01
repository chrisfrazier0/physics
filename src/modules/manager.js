export class EntityManager {
  #nextId = 0;
  #entities = new Set();
  #components = new Map();

  constructor(registry) {
    this.registry = registry;
  }

  createEntity() {
    const id = this.#nextId++;
    this.#entities.add(id);
    return id;
  }

  destroyEntity(id) {
    if (!this.#entities.delete(id)) return false;
    for (const store of this.#components.values()) {
      store.delete(id);
    }
    return true;
  }

  addComponent(id, type, data) {
    if (!this.#entities.has(id)) {
      throw new Error('unknown entity ' + id);
    }
    let store = this.#components.get(type);
    if (!store) this.#components.set(type, (store = new Map()));
    store.set(id, data);
    return this;
  }

  removeComponent(id, type) {
    return this.#components.get(type)?.delete(id) ?? false;
  }

  hasComponent(id, type) {
    return this.#components.get(type)?.has(id) ?? false;
  }

  getComponent(id, type) {
    return this.#components.get(type)?.get(id);
  }

  spawn(spec = {}) {
    const id = this.createEntity();
    for (const [name, arg] of Object.entries(spec)) {
      const ctor = this.registry[name];
      if (typeof ctor !== 'function')
        throw new Error('unknown component ' + name);
      this.addComponent(id, name, arg == null ? ctor() : ctor(arg));
    }
    return id;
  }

  *query(...types) {
    if (types.length === 0) return;
    const stores = types.map((t) => this.#components.get(t));
    if (stores.some((s) => !s)) return;

    let baseIdx = 0;
    for (let i = 1; i < stores.length; i++) {
      if (stores[i].size < stores[baseIdx].size) baseIdx = i;
    }
    const base = stores[baseIdx];

    outer: for (const id of base.keys()) {
      for (let i = 0; i < stores.length; i++) {
        if (i === baseIdx) continue;
        if (!stores[i].has(id)) continue outer;
      }
      yield id;
    }
  }

  *queryRows(...types) {
    if (types.length === 0) return;
    const stores = types.map((t) => this.#components.get(t));
    if (stores.some((s) => !s)) return;

    let baseIdx = 0;
    for (let i = 1; i < stores.length; i++) {
      if (stores[i].size < stores[baseIdx].size) baseIdx = i;
    }
    const base = stores[baseIdx];

    outer: for (const id of base.keys()) {
      const row = new Array(types.length + 1);
      row[0] = id;
      for (let i = 0; i < stores.length; i++) {
        const c = stores[i].get(id);
        if (c === undefined) continue outer;
        row[i + 1] = c;
      }
      yield row;
    }
  }
}
