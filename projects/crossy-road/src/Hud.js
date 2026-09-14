// Manages the DOM overlay: score display and game-over panel.
export class Hud {
  constructor(onRestart) {
    this.scoreValue = document.getElementById("score-value");
    this.finalScore = document.getElementById("final-score");
    this.gameOverPanel = document.getElementById("game-over");
    this.restartBtn = document.getElementById("restart-btn");

    this._score = -1;
    this.restartBtn.addEventListener("click", () => onRestart());
  }

  setScore(score) {
    if (score === this._score) return;
    this._score = score;
    this.scoreValue.textContent = String(score);
  }

  showGameOver(finalScore) {
    this.finalScore.textContent = String(finalScore);
    this.gameOverPanel.classList.add("visible");
  }

  hideGameOver() {
    this.gameOverPanel.classList.remove("visible");
  }
}
