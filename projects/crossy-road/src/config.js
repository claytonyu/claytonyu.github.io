// Tunable game constants.

export const TILE = 1; // world units per grid tile

// How many columns are playable left-right (centered on 0).
// Half-width: columns range from -COLS_HALF .. +COLS_HALF.
// This is the single source of truth for the horizontal boundary: the player
// can walk exactly this far, and being carried past it (by a log) is death.
// Sized to a fixed, comfortable on-screen width so it stays visible across
// window sizes.
export const COLS_HALF = 5;

// The walkable / death boundary in world X (derived from COLS_HALF).
export const PLAY_HALF_WIDTH = COLS_HALF * TILE;

// Horizontal bounds (in world X) where hazards live / wrap. Kept slightly
// wider than the play boundary so cars/logs wrap just off the walkable edge
// while still fully covering the walkable width.
export const FIELD_HALF_WIDTH = PLAY_HALF_WIDTH + 1 * TILE;

// Decorative, non-walkable scenery flanking the playfield. Because the camera
// is horizontally fixed at the playfield center, the visible width off to each
// side is bounded, so we draw scenery out to a fixed half-width that comfortably
// covers wide screens. Everything beyond PLAY_HALF_WIDTH is not walkable and is
// drawn with a desaturated tint so the player can read it as "out of bounds".
export const SIDE = {
  // How far (world units) the drawn scenery extends past the play boundary.
  halfWidth: 10,
  // 0 = fully desaturated (grey), 1 = original color. Lower = more clearly
  // "not part of the play area".
  tint: 0.45,
  // Extra darkening applied to the desaturated color (0 = none, 1 = black).
  darken: 0.25,
  // Decorative objects (rocks/bushes on land, rocks/lily pads on water) per
  // side, per lane, and their bob/sway animation.
  decorPerSide: 2,
  bobHeight: 0.12,
  bobSpeed: 1.5,
};

// Generation window (in rows) relative to the player.
export const ROWS_AHEAD = 15;
export const ROWS_BEHIND = 3;

// Number of initial safe rows at the start.
export const SAFE_START_ROWS = 4;

// Lane types.
export const LANE = {
  SAFE: "safe",
  GRASS: "grass",
  ROAD: "road",
  RIVER: "river",
};

// Colors.
export const COLORS = {
  grass: 0x63c74d,
  grassAlt: 0x57b843,
  safe: 0x7ad86a,
  road: 0x4c4c54,
  roadStripe: 0xf2d541,
  river: 0x2f74d0,
  riverAlt: 0x2a68bd,
  log: 0x8a5a2b,
  player: 0xf4f4f4,
  playerFace: 0xffcf6b,
  car: [0xe5533b, 0xf2b134, 0x9b5de5, 0x4dd0e1, 0xff7ab6],
};

// Player hop timing (seconds).
export const HOP_DURATION = 0.13;
export const HOP_HEIGHT = 0.55;

// Difficulty tuning. Difficulty grows with furthest row reached.
export const DIFFICULTY = {
  // difficulty level = floor(maxRow / rowsPerLevel)
  rowsPerLevel: 8,
  baseSpeed: 2.2, // world units / second
  speedPerLevel: 0.45,
  maxSpeed: 9.0,
  // hazard count grows slowly with difficulty
  baseCars: 1.8,
  carsPerLevel: 0.3,
  maxCars: 6,
  baseLogs: 1.8,
  logsPerLevel: 0.25,
  maxLogs: 5,
};

// Camera framing (isometric orthographic).
export const CAMERA = {
  viewSize: 5, // vertical half-extent of the ortho frustum in world units
  // Offset from the player (in world units) for the isometric look.
  offset: { x: 2, y: 10, z: 9 },
  followLerp: 0.12,
};
