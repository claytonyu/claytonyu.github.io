import {
  TILE,
  LANE,
  ROWS_AHEAD,
  ROWS_BEHIND,
  SAFE_START_ROWS,
  PLAY_HALF_WIDTH,
  DIFFICULTY,
} from "./config.js";
import { Lane } from "./Lane.js";

// Result codes returned from collision checks.
export const HAZARD = {
  NONE: "none",
  CAR: "car",
  DROWN: "drown",
  CARRIED_OFF: "carried_off",
};

// Owns lane generation/recycling, difficulty, hazard movement, and collisions.
export class World {
  constructor(renderer) {
    this.renderer = renderer;
    this.lanes = new Map(); // row -> Lane
    this.maxGeneratedRow = -1;
    this.reset();
  }

  reset() {
    for (const lane of this.lanes.values()) {
      this.renderer.remove(lane.group);
      lane.dispose();
    }
    this.lanes.clear();
    this.maxGeneratedRow = -1;
    this._lastRiverStreak = 0;

    // Generate the initial band around the start.
    for (let row = -ROWS_BEHIND; row <= ROWS_AHEAD; row++) {
      this._generateRow(row);
    }
  }

  difficultyLevel(maxRow) {
    return Math.max(0, Math.floor(maxRow / DIFFICULTY.rowsPerLevel));
  }

  _speedFor(level) {
    return Math.min(
      DIFFICULTY.maxSpeed,
      DIFFICULTY.baseSpeed + level * DIFFICULTY.speedPerLevel
    );
  }

  _carCount(level) {
    return Math.min(
      DIFFICULTY.maxCars,
      Math.round(DIFFICULTY.baseCars + level * DIFFICULTY.carsPerLevel)
    );
  }

  _logCount(level) {
    return Math.max(
      1,
      Math.min(
        DIFFICULTY.maxLogs,
        Math.round(DIFFICULTY.baseLogs + level * DIFFICULTY.logsPerLevel)
      )
    );
  }

  _pickType(row) {
    if (row <= SAFE_START_ROWS - 1) return LANE.SAFE;

    // Avoid 3+ rivers in a row; sprinkle safe/grass rows.
    const r = Math.random();
    let type;
    if (this._lastRiverStreak >= 2) {
      // force non-river
      type = r < 0.45 ? LANE.ROAD : r < 0.8 ? LANE.GRASS : LANE.SAFE;
    } else if (r < 0.4) {
      type = LANE.ROAD;
    } else if (r < 0.7) {
      type = LANE.RIVER;
    } else if (r < 0.9) {
      type = LANE.GRASS;
    } else {
      type = LANE.SAFE;
    }

    this._lastRiverStreak = type === LANE.RIVER ? this._lastRiverStreak + 1 : 0;
    return type;
  }

  _generateRow(row) {
    if (this.lanes.has(row)) return;

    const level = this.difficultyLevel(Math.max(row, 0));
    const type = this._pickType(row);
    const opts = {};

    if (type === LANE.ROAD) {
      opts.speed = this._speedFor(level) * (0.85 + Math.random() * 0.4);
      opts.direction = Math.random() < 0.5 ? 1 : -1;
      opts.count = this._carCount(level);
    } else if (type === LANE.RIVER) {
      opts.speed = this._speedFor(level) * (0.7 + Math.random() * 0.4);
      opts.direction = Math.random() < 0.5 ? 1 : -1;
      opts.count = this._logCount(level);
    }

    const lane = new Lane(row, type, opts);
    this.lanes.set(row, lane);
    this.renderer.add(lane.group);
    if (row > this.maxGeneratedRow) this.maxGeneratedRow = row;
  }

  // Ensure lanes exist ahead of the player and recycle those far behind.
  ensureAround(playerRow) {
    const target = playerRow + ROWS_AHEAD;
    for (let row = this.maxGeneratedRow + 1; row <= target; row++) {
      this._generateRow(row);
    }
    const cutoff = playerRow - ROWS_BEHIND;
    for (const [row, lane] of this.lanes) {
      if (row < cutoff) {
        this.renderer.remove(lane.group);
        lane.dispose();
        this.lanes.delete(row);
      }
    }
  }

  laneAt(row) {
    return this.lanes.get(row) || null;
  }

  updateHazards(dt) {
    for (const lane of this.lanes.values()) {
      lane.update(dt);
    }
  }

  // Evaluate the player's interaction with the lane they occupy.
  // For rivers, if riding a log, carry the player (mutating via player.carry).
  // Returns a HAZARD code.
  evaluate(player, dt) {
    const lane = this.laneAt(player.row);
    if (!lane) return HAZARD.NONE;

    if (lane.type === LANE.ROAD) {
      const hit = lane.hazardAt(player.worldX);
      return hit ? HAZARD.CAR : HAZARD.NONE;
    }

    if (lane.type === LANE.RIVER) {
      // Give the player up to 0.2 a tile of leeway to land on a log.
      const log = lane.hazardAt(player.worldX, TILE * 0.2);
      if (!log) return HAZARD.DROWN;
      // Carry the player at the log's speed/direction.
      player.carry(lane.hazardDelta(dt));
      // Carried-off death: walking clamps the player's center to
      // PLAY_HALF_WIDTH (fully on land). A log can drift the player further.
      // We only kill once the player is "half-on, half-off" — i.e. its center
      // has crossed the edge of the walkable ground, a half-tile past
      // PLAY_HALF_WIDTH. Beyond that the player is more off the field than on.
      const carriedOffLimit = PLAY_HALF_WIDTH + TILE / 2;
      if (Math.abs(player.worldX) > carriedOffLimit) {
        return HAZARD.CARRIED_OFF;
      }
      return HAZARD.NONE;
    }

    return HAZARD.NONE;
  }
}
