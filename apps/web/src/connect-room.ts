// A busy authoritative read releases its lock at the server's deadline. Retry
// only that explicit transient status; never retry denied or revoked access.
export async function connectRoom<T>(
  join: () => Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  // The final attempt must outlast an overlapping two-second server read.
  const delays = [500, 1_000, 2_000];
  for (let attempt = 0; ; attempt++) {
    signal.throwIfAborted();
    try {
      return await join();
    } catch (error) {
      const delay = delays[attempt];
      if (
        delay === undefined ||
        typeof error !== "object" ||
        error === null ||
        !("code" in error) ||
        error.code !== 503
      )
        throw error;
      await new Promise<void>((resolve, reject) => {
        const abort = () => {
          clearTimeout(timer);
          reject(signal.reason);
        };
        const timer = setTimeout(() => {
          signal.removeEventListener("abort", abort);
          resolve();
        }, delay);
        signal.addEventListener("abort", abort, { once: true });
        if (signal.aborted) {
          signal.removeEventListener("abort", abort);
          abort();
        }
      });
    }
  }
}
