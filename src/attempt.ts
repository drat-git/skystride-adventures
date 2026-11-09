export interface RunResult {
  elapsedMs: number;
  deaths: number;
  collected: number;
  totalItems: number;
}

/** Active gameplay time and collectibles belong to one attempt. Death preserves both. */
export class Attempt {
  elapsedMs = 0;
  deaths = 0;
  paused = false;
  finished = false;
  private readonly availableItems: Set<string>;
  private readonly collectedItems = new Set<string>();

  constructor(itemIds: readonly string[] = []) { this.availableItems = new Set(itemIds); }

  get collected() { return this.collectedItems.size; }
  get totalItems() { return this.availableItems.size; }

  tick(delta: number) { if (!this.paused && !this.finished && Number.isFinite(delta)) this.elapsedMs += Math.max(0,delta); }
  die() { if (!this.finished && !this.paused) this.deaths++; }
  finish(): boolean { if (this.finished || this.paused) return false;this.finished=true;return true; }

  collect(id: string): boolean {
    if (this.paused || this.finished || !this.availableItems.has(id) || this.collectedItems.has(id)) return false;
    this.collectedItems.add(id);
    return true;
  }

  result(): RunResult {
    return { elapsedMs: Math.round(this.elapsedMs), deaths: this.deaths, collected: this.collected, totalItems: this.totalItems };
  }
}
