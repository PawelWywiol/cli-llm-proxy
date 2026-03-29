export class Semaphore {
  private _available: number;
  private _waiters: Array<() => void> = [];

  constructor(maxConcurrent: number) {
    this._available = maxConcurrent;
  }

  get available(): number {
    return this._available;
  }

  get pending(): number {
    return this._waiters.length;
  }

  acquire(): Promise<void> {
    if (this._available > 0) {
      this._available--;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this._waiters.push(resolve);
    });
  }

  release(): void {
    const next = this._waiters.shift();
    if (next) {
      next();
    } else {
      this._available++;
    }
  }
}
