import { TILE } from "./config.js";

// Grid <-> world coordinate helpers.
// row: forward axis (increases away from start) -> maps to negative Z.
// col: left/right axis -> maps to X.

export function colToX(col) {
  return col * TILE;
}

export function rowToZ(row) {
  return -row * TILE;
}

export function xToCol(x) {
  return Math.round(x / TILE);
}

export function toWorld(row, col) {
  return { x: colToX(col), z: rowToZ(row) };
}
