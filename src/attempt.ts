/** Active gameplay time; pause stops both physics and this clock. Death preserves time. */
export class Attempt {
  elapsedMs = 0;
  deaths = 0;
  paused = false;
  finished = false;
  tick(delta: number) { if (!this.paused && !this.finished) this.elapsedMs += Math.max(0,delta); }
  die() { if (!this.finished && !this.paused) this.deaths++; }
  finish(): boolean { if (this.finished || this.paused) return false;this.finished=true;return true; }
}
