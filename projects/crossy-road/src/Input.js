// Translates keyboard (and basic touch swipes) into movement intents.
// Each intent is { dRow, dCol }. Forward = +row.
export class Input {
  constructor(onMove) {
    this.onMove = onMove;
    this._onKey = this._onKey.bind(this);
    this._onTouchStart = this._onTouchStart.bind(this);
    this._onTouchEnd = this._onTouchEnd.bind(this);
    this._touch = null;

    window.addEventListener("keydown", this._onKey);
    window.addEventListener("touchstart", this._onTouchStart, { passive: true });
    window.addEventListener("touchend", this._onTouchEnd, { passive: true });
  }

  _onKey(e) {
    let intent = null;
    switch (e.key) {
      case "ArrowUp":
      case "w":
      case "W":
        intent = { dRow: 1, dCol: 0 };
        break;
      case "ArrowDown":
      case "s":
      case "S":
        intent = { dRow: -1, dCol: 0 };
        break;
      case "ArrowLeft":
      case "a":
      case "A":
        intent = { dRow: 0, dCol: -1 };
        break;
      case "ArrowRight":
      case "d":
      case "D":
        intent = { dRow: 0, dCol: 1 };
        break;
      default:
        return;
    }
    e.preventDefault();
    this.onMove(intent);
  }

  _onTouchStart(e) {
    const t = e.changedTouches[0];
    this._touch = { x: t.clientX, y: t.clientY };
  }

  _onTouchEnd(e) {
    if (!this._touch) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - this._touch.x;
    const dy = t.clientY - this._touch.y;
    this._touch = null;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    const threshold = 24;
    if (absX < threshold && absY < threshold) {
      // tap = move forward
      this.onMove({ dRow: 1, dCol: 0 });
      return;
    }
    if (absX > absY) {
      this.onMove({ dRow: 0, dCol: dx > 0 ? 1 : -1 });
    } else {
      // screen up (negative dy) = forward
      this.onMove({ dRow: dy < 0 ? 1 : -1, dCol: 0 });
    }
  }

  dispose() {
    window.removeEventListener("keydown", this._onKey);
    window.removeEventListener("touchstart", this._onTouchStart);
    window.removeEventListener("touchend", this._onTouchEnd);
  }
}
