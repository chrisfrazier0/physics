export const WorldBoundary = {
  NONE: 0,
  FLOOR: 1 << 0,
  CEILING: 1 << 1,
  LEFT: 1 << 2,
  RIGHT: 1 << 3,
  ALL: (1 << 4) - 1,
};
