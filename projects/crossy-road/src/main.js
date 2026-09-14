import { Game } from "./Game.js";

// Bootstraps the game and runs the animation loop.
export async function start() {
  const canvas = document.getElementById("game-canvas");
  const game = new Game(canvas);

  let last = performance.now();

  function frame(now) {
    // dt in seconds, clamped to avoid big jumps after tab defocus.
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.1) dt = 0.1;

    game.update(dt);
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
  return game;
}
