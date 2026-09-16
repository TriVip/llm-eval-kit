import { ProviderError } from "./errors.js";

export type RetryPolicy = {
  timeoutMs: number;
  maxRetries: number;
};

export type RetryDependencies = {
  sleep: (milliseconds: number) => Promise<void>;
  random: () => number;
};

const defaultRetryDependencies: RetryDependencies = {
  sleep: async (milliseconds) =>
    new Promise((resolve) => {
      setTimeout(resolve, milliseconds);
    }),
  random: Math.random,
};

export type AttemptOperation<T> = (attempt: number, signal: AbortSignal) => Promise<T>;

function retryDelay(attempt: number, random: () => number): number {
  const baseMs = Math.min(100 * 2 ** (attempt - 1), 2_000);
  return Math.round(baseMs * (0.75 + random() * 0.5));
}

async function runTimedAttempt<T>(
  operation: AttemptOperation<T>,
  attempt: number,
  timeoutMs: number,
): Promise<T> {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      controller.abort();
      reject(
        new ProviderError({
          code: "PROVIDER_TIMEOUT",
          safeMessage: `Provider request timed out after ${timeoutMs}ms.`,
          retryable: true,
        }),
      );
    }, timeoutMs);
  });

  try {
    return await Promise.race([operation(attempt, controller.signal), timeoutPromise]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

export async function executeWithRetry<T>(
  operation: AttemptOperation<T>,
  policy: RetryPolicy,
  dependencies: RetryDependencies = defaultRetryDependencies,
): Promise<T> {
  let attempt = 1;

  while (true) {
    try {
      return await runTimedAttempt(operation, attempt, policy.timeoutMs);
    } catch (error) {
      const retryable = error instanceof ProviderError && error.retryable;
      if (!retryable || attempt > policy.maxRetries) throw error;
      await dependencies.sleep(retryDelay(attempt, dependencies.random));
      attempt += 1;
    }
  }
}

export type BoundedMapResult<T> = {
  results: Array<T | undefined>;
  unscheduledIndexes: number[];
};

export class ConcurrencyLimiter {
  private active = 0;
  private readonly waiting: Array<() => void> = [];

  public constructor(private readonly limit: number) {
    if (!Number.isInteger(limit) || limit < 1) {
      throw new RangeError("Concurrency limit must be a positive integer.");
    }
  }

  public async run<T>(operation: () => Promise<T>): Promise<T> {
    if (this.active >= this.limit) {
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    } else {
      this.active += 1;
    }
    try {
      return await operation();
    } finally {
      const next = this.waiting.shift();
      if (next === undefined) {
        this.active -= 1;
      } else {
        // Keep the released slot reserved while ownership is handed directly
        // to the next waiter. This closes the release/resume race window.
        next();
      }
    }
  }
}

export async function mapWithConcurrency<TInput, TOutput>(
  inputs: readonly TInput[],
  concurrency: number,
  worker: (input: TInput, index: number) => Promise<TOutput>,
  shouldStop: () => boolean = () => false,
): Promise<BoundedMapResult<TOutput>> {
  const results = new Array<TOutput | undefined>(inputs.length);
  let nextIndex = 0;

  async function consume(): Promise<void> {
    while (nextIndex < inputs.length && !shouldStop()) {
      const index = nextIndex;
      nextIndex += 1;
      const input = inputs[index];
      if (input !== undefined) results[index] = await worker(input, index);
    }
  }

  const workerCount = Math.min(Math.max(1, concurrency), inputs.length);
  await Promise.all(Array.from({ length: workerCount }, consume));

  return {
    results,
    unscheduledIndexes: Array.from(
      { length: inputs.length - nextIndex },
      (_, offset) => nextIndex + offset,
    ),
  };
}
