import { describe, expect, it } from "vitest";

import {
  ConcurrencyLimiter,
  executeWithRetry,
  mapWithConcurrency,
  ProviderError,
} from "../src/index.js";

describe("provider execution policy", () => {
  it("retries only typed transient errors and records the attempt sequence", async () => {
    const attempts: number[] = [];
    const result = await executeWithRetry(
      async (attempt) => {
        attempts.push(attempt);
        if (attempt === 1) {
          throw new ProviderError({
            code: "PROVIDER_RATE_LIMITED",
            safeMessage: "Rate limited",
            retryable: true,
          });
        }
        return "ok";
      },
      { timeoutMs: 100, maxRetries: 2 },
      { sleep: async () => undefined, random: () => 0 },
    );

    expect(result).toBe("ok");
    expect(attempts).toEqual([1, 2]);
  });

  it("does not retry authentication or invalid request failures", async () => {
    let calls = 0;
    await expect(
      executeWithRetry(
        async () => {
          calls += 1;
          throw new ProviderError({
            code: "PROVIDER_AUTHENTICATION_ERROR",
            safeMessage: "No",
            retryable: false,
          });
        },
        { timeoutMs: 100, maxRetries: 3 },
        { sleep: async () => undefined, random: () => 0 },
      ),
    ).rejects.toMatchObject({ code: "PROVIDER_AUTHENTICATION_ERROR" });
    expect(calls).toBe(1);
  });

  it("converts elapsed attempts into typed retryable timeouts", async () => {
    await expect(
      executeWithRetry(async () => new Promise(() => undefined), {
        timeoutMs: 5,
        maxRetries: 0,
      }),
    ).rejects.toMatchObject({ code: "PROVIDER_TIMEOUT", retryable: true });
  });
});

describe("bounded concurrency scheduler", () => {
  it("never exceeds the cap and preserves input order", async () => {
    let inFlight = 0;
    let maximumInFlight = 0;
    const result = await mapWithConcurrency([0, 1, 2, 3], 2, async (value) => {
      inFlight += 1;
      maximumInFlight = Math.max(maximumInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, (4 - value) * 2));
      inFlight -= 1;
      return `case-${value}`;
    });

    expect(maximumInFlight).toBe(2);
    expect(result.results).toEqual(["case-0", "case-1", "case-2", "case-3"]);
    expect(result.unscheduledIndexes).toEqual([]);
  });

  it("stops scheduling new work while allowing in-flight work to finish", async () => {
    let completed = 0;
    const result = await mapWithConcurrency(
      [0, 1, 2, 3],
      1,
      async (value) => {
        completed += 1;
        return value;
      },
      () => completed >= 2,
    );

    expect(result.results.slice(0, 2)).toEqual([0, 1]);
    expect(result.unscheduledIndexes).toEqual([2, 3]);
  });

  it("provides a reusable semaphore for model-based provider calls", async () => {
    expect(() => new ConcurrencyLimiter(0)).toThrow(/positive integer/);
    const limiter = new ConcurrencyLimiter(1);
    let inFlight = 0;
    let maximumInFlight = 0;
    await Promise.all(
      [1, 2].map((value) =>
        limiter.run(async () => {
          inFlight += 1;
          maximumInFlight = Math.max(maximumInFlight, inFlight);
          await new Promise((resolve) => setTimeout(resolve, 2));
          inFlight -= 1;
          return value;
        }),
      ),
    );
    expect(maximumInFlight).toBe(1);
  });

  it("reserves a released slot for the queued waiter before a fresh caller can enter", async () => {
    const limiter = new ConcurrencyLimiter(1);
    let inFlight = 0;
    let maximumInFlight = 0;
    let releaseFirst: () => void = () => undefined;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const track = async (gate: Promise<void>) => {
      inFlight += 1;
      maximumInFlight = Math.max(maximumInFlight, inFlight);
      await gate;
      inFlight -= 1;
    };

    const first = limiter.run(() => track(firstGate));
    const second = limiter.run(() => track(Promise.resolve()));

    releaseFirst();
    // The first continuation releases the slot, then this already-queued
    // microtask attempts to enter before the original waiter resumes.
    const third = Promise.resolve().then(() => limiter.run(() => track(Promise.resolve())));

    await Promise.all([first, second, third]);
    expect(maximumInFlight).toBe(1);
  });

  it("holds the configured limit under sustained overlapping load", async () => {
    const limiter = new ConcurrencyLimiter(4);
    let inFlight = 0;
    let maximumInFlight = 0;
    const tasks = Array.from({ length: 200 }, (_, index) =>
      limiter.run(async () => {
        inFlight += 1;
        maximumInFlight = Math.max(maximumInFlight, inFlight);
        await new Promise((resolve) => setTimeout(resolve, index % 3));
        inFlight -= 1;
      }),
    );

    await Promise.all(tasks);
    expect(maximumInFlight).toBeLessThanOrEqual(4);
  });
});
