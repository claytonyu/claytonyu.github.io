import * as THREE from "three";
import {
  TILE,
  PLAY_HALF_WIDTH,
  FIELD_HALF_WIDTH,
  LANE,
  COLORS,
  SIDE,
} from "./config.js";
import { rowToZ } from "./Grid.js";

// The walkable ground spans exactly the play width, so everything the player
// can walk on reads as "in bounds". Hazards spawn and wrap in a wider band
// (FIELD_HALF_WIDTH) so they slide in and out of view.
const LANE_LENGTH = FIELD_HALF_WIDTH * 2;

// The player can stand with its *center* out to PLAY_HALF_WIDTH (the edge
// column). Its body has width, so the walkable ground must extend half a tile
// past that on each side for the player to be fully on land at the extremes.
const WALK_HALF_WIDTH = PLAY_HALF_WIDTH + TILE / 2;

// Width of each flanking (non-walkable) side ground strip, starting where the
// walkable ground ends.
const SIDE_STRIP_WIDTH = SIDE.halfWidth - WALK_HALF_WIDTH;
// Center X of each side strip (mirrored for left/right).
const SIDE_STRIP_CENTER = (WALK_HALF_WIDTH + SIDE.halfWidth) / 2;

// Produce a desaturated + darkened variant of a base color so the flanking
// scenery reads as "not walkable" while still hinting at the lane's material.
function tintedSideColor(hex) {
  const c = new THREE.Color(hex);
  // Desaturate toward grey.
  const grey = new THREE.Color(0.5, 0.5, 0.5);
  c.lerp(grey, 1 - SIDE.tint);
  // Darken.
  c.multiplyScalar(1 - SIDE.darken);
  return c;
}

// A hazard (car or log) moving horizontally along a lane.
class Hazard {
  constructor(mesh, x, halfWidth) {
    this.mesh = mesh;
    this.x = x;
    this.halfWidth = halfWidth; // half of its collision extent along X
  }
}

// A single row of the world with a type, meshes, and (for road/river) hazards.
export class Lane {
  constructor(row, type, opts = {}) {
    this.row = row;
    this.type = type;
    this.group = new THREE.Group();
    this.group.position.z = rowToZ(row);

    this.direction = opts.direction || 1; // +1 or -1
    this.speed = opts.speed || 0; // world units / second
    this.hazards = [];
    // Animated decorative props living in the non-walkable side strips.
    this.decor = [];
    this._elapsed = 0;

    this._buildGround();
    this._buildSides();

    if (type === LANE.ROAD) {
      this._buildCars(opts.count || 2);
    } else if (type === LANE.RIVER) {
      this._buildLogs(opts.count || 2);
    }
  }

  _buildGround() {
    let color;
    if (this.type === LANE.ROAD) color = COLORS.road;
    else if (this.type === LANE.RIVER) color = COLORS.river;
    else if (this.type === LANE.SAFE) color = COLORS.safe;
    else color = this.row % 2 === 0 ? COLORS.grass : COLORS.grassAlt;

    this.baseColor = color;
    // Walkable ground spans the play width plus a half-tile margin per side so
    // the player standing on an edge column sits fully on land, not straddling
    // the tinted side strip.
    const geo = new THREE.BoxGeometry(WALK_HALF_WIDTH * 2, 0.4, TILE);
    const mat = new THREE.MeshStandardMaterial({ color });
    const ground = new THREE.Mesh(geo, mat);
    ground.position.y = -0.2;
    ground.receiveShadow = true;
    this.group.add(ground);

    if (this.type === LANE.ROAD) {
      // center dashed stripe (only across the walkable width)
      const stripeMat = new THREE.MeshStandardMaterial({
        color: COLORS.roadStripe,
      });
      for (let x = -PLAY_HALF_WIDTH+TILE/2; x <= PLAY_HALF_WIDTH-TILE/2; x += TILE) {
        const s = new THREE.Mesh(
          new THREE.BoxGeometry(TILE * 0.4, 0.01, 0.06),
          stripeMat
        );
        s.position.set(x, 0.01, 0);
        this.group.add(s);
      }
    }
  }

  // Build the non-walkable scenery flanking the playfield: a tinted ground
  // strip on each side plus a few animated decorative props. The tint (a
  // desaturated, darkened version of the lane color) signals "out of bounds".
  _buildSides() {
    const sideColor = tintedSideColor(this.baseColor);
    const sideMat = new THREE.MeshStandardMaterial({ color: sideColor });
    // Reuse one material per lane for both strips (cheap; disposed via group).
    this._sideMat = sideMat;

    for (const sign of [-1, 1]) {
      const strip = new THREE.Mesh(
        new THREE.BoxGeometry(SIDE_STRIP_WIDTH, 0.4, TILE),
        sideMat
      );
      // Sit a touch lower than the walkable ground so the seam reads as a
      // small ledge/curb rather than a flush continuation.
      strip.position.set(sign * SIDE_STRIP_CENTER, -0.20, 0);
      strip.receiveShadow = true;
      this.group.add(strip);

      // Only grass lanes (grass + safe grass) get decorative props; road and
      // river sides stay clear.
      if (this.type === LANE.GRASS || this.type === LANE.SAFE) {
        this._buildSideDecor(sign, sideColor);
      }
    }
  }

  // Scatter animated props across one side strip. Land lanes get bushes/rocks
  // that bob gently; rivers get lily-pad / rock shapes that bob like they're
  // floating. All are desaturated to match the "not walkable" side tint.
  _buildSideDecor(sign, sideColor) {
    const isWater = this.type === LANE.RIVER;
    const innerEdge = WALK_HALF_WIDTH + TILE * 0.6;
    const outerEdge = SIDE.halfWidth - TILE * 0.6;
    const n = SIDE.decorPerSide;

    for (let i = 0; i < n; i++) {
      // Scatter props randomly across the whole side strip so they don't line
      // up in rows. X is a uniform random position between the inner and outer
      // edges of the strip; Z is anywhere across the lane's depth.
      const x = sign * (innerEdge + Math.random() * (outerEdge - innerEdge));
      const z = (Math.random() - 0.5) * TILE;

      let mesh;
      if (isWater) {
        mesh = this._makeWaterProp(sideColor);
      } else {
        mesh = this._makeLandProp(sideColor);
      }
      mesh.position.set(x, 0, z);
      mesh.castShadow = true;
      this.group.add(mesh);

      this.decor.push({
        mesh,
        baseY: mesh.position.y,
        // Randomize phase/speed so props don't bob in lockstep.
        phase: Math.random() * Math.PI * 2,
        speed: SIDE.bobSpeed * (0.7 + Math.random() * 0.6),
        amp: SIDE.bobHeight * (0.6 + Math.random() * 0.8),
        // Slow spin for a bit of life.
        spin: (Math.random() - 0.5) * 0.6,
      });
    }
  }

  _makeLandProp(sideColor) {
    // A rounded bush (sphere) or a rock (low box), tinted to the side palette.
    if (Math.random() < 0.6) {
      const r = TILE * (0.22 + Math.random() * 0.16);
      const bushMat = new THREE.MeshStandardMaterial({
        color: tintedSideColor(0x4f8f3a),
      });
      const bush = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), bushMat);
      bush.position.y = r * 0.8;
      return bush;
    }
    const s = TILE * (0.22 + Math.random() * 0.2);
    const rockMat = new THREE.MeshStandardMaterial({
      color: tintedSideColor(0x8a8f96),
    });
    const rock = new THREE.Mesh(new THREE.BoxGeometry(s, s * 0.8, s), rockMat);
    rock.rotation.y = Math.random() * Math.PI;
    rock.position.y = s * 0.4;
    return rock;
  }

  _makeWaterProp(sideColor) {
    // A flat lily pad (cylinder) or a poking rock, floating on the tinted water.
    if (Math.random() < 0.65) {
      const r = TILE * (0.28 + Math.random() * 0.18);
      const padMat = new THREE.MeshStandardMaterial({
        color: tintedSideColor(0x3f9a4f),
      });
      const pad = new THREE.Mesh(
        new THREE.CylinderGeometry(r, r, TILE * 0.06, 12),
        padMat
      );
      pad.position.y = 0.04;
      return pad;
    }
    const s = TILE * (0.2 + Math.random() * 0.18);
    const rockMat = new THREE.MeshStandardMaterial({
      color: tintedSideColor(0x6f7681),
    });
    const rock = new THREE.Mesh(new THREE.BoxGeometry(s, s * 0.7, s), rockMat);
    rock.position.y = s * 0.2;
    return rock;
  }

  _spacing(count) {
    // Evenly distribute across the field width.
    const span = FIELD_HALF_WIDTH * 2;
    return span / count;
  }

  _buildCars(count) {
    const spacing = this._spacing(count);
    for (let i = 0; i < count; i++) {
      const color =
        COLORS.car[Math.floor(Math.random() * COLORS.car.length)];
      const bodyGeo = new THREE.BoxGeometry(TILE * 0.8, TILE * 0.5, TILE * 0.55);
      const car = new THREE.Mesh(
        bodyGeo,
        new THREE.MeshStandardMaterial({ color })
      );
      car.castShadow = true;
      car.position.y = TILE * 0.28;

      const roofGeo = new THREE.BoxGeometry(TILE * 0.45, TILE * 0.3, TILE * 0.5);
      const roof = new THREE.Mesh(
        roofGeo,
        new THREE.MeshStandardMaterial({ color })
      );
      roof.position.set(-TILE * 0.05, TILE * 0.55, 0);
      car.add(roof);

      const x = -FIELD_HALF_WIDTH + i * spacing + Math.random() * spacing * 0.3;
      car.position.x = x;
      this.group.add(car);
      this.hazards.push(new Hazard(car, x, TILE * 0.4));
    }
  }

  _buildLogs(count) {
    const spacing = this._spacing(count);
    for (let i = 0; i < count; i++) {
      // logs are 2-3 tiles long
      const len = TILE * (2 + Math.floor(Math.random() * 2));
      const geo = new THREE.BoxGeometry(len, TILE * 0.3, TILE * 0.7);
      const log = new THREE.Mesh(
        geo,
        new THREE.MeshStandardMaterial({ color: COLORS.log })
      );
      log.castShadow = true;
      log.position.y = 0.02;

      const x = -FIELD_HALF_WIDTH + i * spacing + Math.random() * spacing * 0.3;
      log.position.x = x;
      this.group.add(log);
      this.hazards.push(new Hazard(log, x, len / 2));
    }
  }

  // Advance hazards (wrap around field bounds) and animate side decor.
  update(dt) {
    this._animateDecor(dt);

    if (this.speed === 0 || this.hazards.length === 0) return;
    const delta = this.direction * this.speed * dt;
    // Hazards travel and wrap across the full drawn (desaturated) region so
    // they only recycle once they've left the visible scenery entirely, not at
    // the walkable boundary.
    const bound = SIDE.halfWidth + 2;
    for (const h of this.hazards) {
      h.x += delta;
      if (h.x > bound) h.x -= bound * 2;
      else if (h.x < -bound) h.x += bound * 2;
      h.mesh.position.x = h.x;

      // Keep a hazard visible while any part of it is still within the drawn
      // scenery span [-SIDE.halfWidth, +SIDE.halfWidth]; hide it only once it
      // is entirely past the visible edge (out of the player's field of view).
      // Uses the hazard's real half-width so long logs don't pop while a corner
      // is still on screen. Purely visual — collision/log-riding are unaffected.
      h.mesh.visible =
        h.x - h.halfWidth <= SIDE.halfWidth &&
        h.x + h.halfWidth >= -SIDE.halfWidth;
    }
  }

  // Gently bob (and slowly spin) the side decor so the out-of-bounds regions
  // feel alive rather than static.
  _animateDecor(dt) {
    if (this.decor.length === 0) return;
    this._elapsed += dt;
    for (const d of this.decor) {
      d.mesh.position.y =
        d.baseY + Math.sin(this._elapsed * d.speed + d.phase) * d.amp;
      d.mesh.rotation.y += d.spin * dt;
    }
  }

  // The per-frame X delta a hazard applies (used for log carrying).
  hazardDelta(dt) {
    return this.direction * this.speed * dt;
  }

  // Return the hazard overlapping playerX, or null.
  // `margin` is how far *beyond* the hazard's edge still counts as a hit,
  // in world units (0 = must be within the hazard's extent).
  hazardAt(playerX, margin = 0) {
    for (const h of this.hazards) {
      if (Math.abs(h.x - playerX) <= h.halfWidth + margin) {
        return h;
      }
    }
    return null;
  }

  dispose() {
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
        else o.material.dispose();
      }
    });
  }
}

export { LANE_LENGTH };
