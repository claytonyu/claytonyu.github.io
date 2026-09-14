import * as THREE from "three";
import { TILE, COLS_HALF, COLORS, HOP_DURATION, HOP_HEIGHT } from "./config.js";
import { colToX, rowToZ } from "./Grid.js";

// The single controllable character. Occupies one tile; hops one tile per input.
export class Player {
  constructor() {
    this.group = new THREE.Group();

    const bodyGeo = new THREE.BoxGeometry(TILE * 0.6, TILE * 0.6, TILE * 0.6);
    const bodyMat = new THREE.MeshStandardMaterial({ color: COLORS.player });
    this.body = new THREE.Mesh(bodyGeo, bodyMat);
    this.body.position.y = TILE * 0.3;
    this.body.castShadow = true;
    this.group.add(this.body);

    // A little "beak"/face marker so orientation reads.
    const faceGeo = new THREE.BoxGeometry(TILE * 0.2, TILE * 0.2, TILE * 0.2);
    const faceMat = new THREE.MeshStandardMaterial({ color: COLORS.playerFace });
    this.face = new THREE.Mesh(faceGeo, faceMat);
    this.face.position.set(0, TILE * 0.35, -TILE * 0.35);
    this.group.add(this.face);

    this.reset();
  }

  reset() {
    this.row = 0;
    this.col = 0;
    // rideOffsetX: extra X applied by a log carrying the player.
    this.rideOffsetX = 0;

    this.baseX = colToX(this.col);
    this.z = rowToZ(this.row);

    this.hop = null; // active hop tween
    this._applyTransform(0);
  }

  get worldX() {
    return this.baseX + this.rideOffsetX;
  }

  get position() {
    return { x: this.worldX, z: this.z };
  }

  get cameraPosition() {
    // Make camera follow slightly in front of the player
    return { x: this.worldX, z: this.z-2 };
  }

  get isHopping() {
    return this.hop !== null;
  }

  // Attempt to move by grid delta. Returns true if a hop started.
  move(dRow, dCol) {
    if (this.isHopping) return false;

    // Start the hop from where the player actually is right now, which
    // includes any drift accumulated while riding a log.
    const fromX = this.worldX;
    const fromZ = rowToZ(this.row);
    const riding = this.rideOffsetX !== 0;

    // Landing X: when riding a log the player carries its drifted X (so it
    // doesn't snap back to the old column); otherwise it lands on the clean
    // grid column. Then clamp to the playable range.
    const desiredX = riding
      ? fromX + dCol * TILE
      : colToX(this.col + dCol);
    const toX = THREE.MathUtils.clamp(
      desiredX,
      colToX(-COLS_HALF),
      colToX(COLS_HALF)
    );

    const newRow = this.row + dRow;
    const toZ = rowToZ(newRow);

    if (newRow === this.row && toX === fromX) return false;

    // Commit the new position. Fold any ride drift into baseX by landing
    // at the actual world X, and re-sync the grid column to the nearest tile
    // so future moves/clamping stay consistent.
    this.row = newRow;
    this.col = THREE.MathUtils.clamp(
      Math.round(toX / TILE),
      -COLS_HALF,
      COLS_HALF
    );
    this.rideOffsetX = 0;
    this.baseX = toX;
    this.z = toZ;

    this.hop = {
      t: 0,
      fromX,
      fromZ,
      toX,
      toZ,
      // face the direction of travel
      turnY: this._turnFor(dRow, dCol),
    };
    return true;
  }

  _turnFor(dRow, dCol) {
    if (dRow > 0) return 0; // forward (−Z)
    if (dRow < 0) return Math.PI; // backward
    if (dCol > 0) return -Math.PI / 2; // right (+X)
    if (dCol < 0) return Math.PI / 2; // left (−X)
    return this.group.rotation.y;
  }

  // Called by physics: carry the player along X by dx (log riding).
  carry(dx) {
    this.rideOffsetX += dx;
  }

  update(dt) {
    if (this.hop) {
      this.hop.t += dt;
      const p = Math.min(this.hop.t / HOP_DURATION, 1);
      const arc = Math.sin(p * Math.PI) * HOP_HEIGHT;

      const x = THREE.MathUtils.lerp(this.hop.fromX, this.hop.toX, p);
      const z = THREE.MathUtils.lerp(this.hop.fromZ, this.hop.toZ, p);
      this.group.position.set(x, arc, z);
      this.group.rotation.y = this.hop.turnY;

      if (p >= 1) {
        this.hop = null;
        this._applyTransform(0);
      }
    } else {
      this._applyTransform(0);
    }
  }

  _applyTransform(yArc) {
    this.group.position.set(this.worldX, yArc, this.z);
  }
}
