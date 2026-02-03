import { WorldBoundary } from '../lib/boundary.js';

export const context = (opts = {}) => ({
  time: {
    frameTime: 0,
    fixedTime: 0,
    ...(opts.time ?? {}),
  },
  world: {
    width: 1,
    height: 1,
    boundary: WorldBoundary.ALL,
    boundaryLayer: 1,
    ...(opts.world ?? {}),
  },
  collisions: opts.collisions ?? [],
  kb: opts.kb ?? null,
  pointer: {
    px: 0, py: 0, // pixel
    x: 0, y: 0, // world
    inside: false,
    ...(opts.pointer ?? {}),
  },
});
