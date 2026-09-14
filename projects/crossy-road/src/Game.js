import { Renderer } from "./Renderer.js";
import { Player } from "./Player.js";
import { Input } from "./Input.js";
import { World, HAZARD } from "./World.js";
import { Hud } from "./Hud.js";

const STATE = { RUNNING: "running", GAME_OVER: "game_over" };

// Orchestrates the renderer, world, player, input, HUD, and game state.
export class Game {
  constructor(canvas) {
    this.renderer = new Renderer(canvas);
    this.world = new World(this.renderer);
    this.player = new Player();
    this.renderer.add(this.player.group);

    this.hud = new Hud(() => this.restart());
    this.input = new Input((intent) => this._handleMove(intent));

    this.state = STATE.RUNNING;
    this.maxRow = 0;

    this.renderer.follow(this.player.cameraPosition, true);
    this.hud.setScore(0);
  }

  _handleMove(intent) {
    if (this.state !== STATE.RUNNING) return;
    this.player.move(intent.dRow, intent.dCol);
  }

  restart() {
    this.hud.hideGameOver();
    this.world.reset();
    this.player.reset();
    this.maxRow = 0;
    this.state = STATE.RUNNING;
    this.renderer.follow(this.player.cameraPosition, true);
    this.hud.setScore(0);
  }

  _gameOver() {
    this.state = STATE.GAME_OVER;
    this.hud.showGameOver(this.maxRow);
  }

  update(dt) {
    this.player.update(dt);

    if (this.state === STATE.RUNNING) {
      // Keep the world populated around the player.
      this.world.ensureAround(this.player.row);

      // Move all hazards.
      this.world.updateHazards(dt);

      // Only resolve hazard interactions when settled on a tile.
      if (!this.player.isHopping) {
        const result = this.world.evaluate(this.player, dt);
        if (result !== HAZARD.NONE) {
          this._gameOver();
        }
      }

      // Scoring: furthest forward row reached.
      if (this.player.row > this.maxRow) {
        this.maxRow = this.player.row;
        this.hud.setScore(this.maxRow);
      }
    }

    // Camera always follows current position (also while carried by a log).
    this.renderer.follow(this.player.cameraPosition);
    this.renderer.render();
  }
}
