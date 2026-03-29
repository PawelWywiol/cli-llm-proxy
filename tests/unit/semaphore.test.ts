import { describe, expect, it } from "vitest";
import { Semaphore } from "../../src/utils/semaphore.js";

describe("Semaphore", () => {
  it("allows acquiring up to max concurrent", async () => {
    const sem = new Semaphore(2);
    expect(sem.available).toBe(2);

    await sem.acquire();
    expect(sem.available).toBe(1);

    await sem.acquire();
    expect(sem.available).toBe(0);
  });

  it("queues when full and releases in order", async () => {
    const sem = new Semaphore(1);
    await sem.acquire();
    expect(sem.available).toBe(0);

    const order: number[] = [];

    const p1 = sem.acquire().then(() => order.push(1));
    const p2 = sem.acquire().then(() => order.push(2));

    expect(sem.pending).toBe(2);

    sem.release();
    await p1;
    expect(sem.pending).toBe(1);

    sem.release();
    await p2;
    expect(sem.pending).toBe(0);

    expect(order).toEqual([1, 2]);
  });

  it("release increments available when no waiters", () => {
    const sem = new Semaphore(2);
    // Start at 2, release adds 1 more (even above max — simple impl)
    sem.release();
    expect(sem.available).toBe(3);
  });

  it("handles concurrent access correctly", async () => {
    const sem = new Semaphore(2);
    let running = 0;
    let maxRunning = 0;

    const task = async () => {
      await sem.acquire();
      running++;
      maxRunning = Math.max(maxRunning, running);
      await new Promise((r) => setTimeout(r, 10));
      running--;
      sem.release();
    };

    await Promise.all([task(), task(), task(), task()]);
    expect(maxRunning).toBe(2);
  });
});
