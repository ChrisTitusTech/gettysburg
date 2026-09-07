// pg-pool does not support aborting a queued checkout. Keep its capacity queue
// here instead, where abandoned room work can be removed before pool.connect.
export class DeliverySlots {
  #active = 0;
  readonly #waiting = new Set<() => void>();

  acquire(signal: AbortSignal): Promise<() => void> {
    return new Promise((resolve, reject) => {
      const abort = () => {
        this.#waiting.delete(start);
        reject(new Error("Room delivery was cancelled."));
      };
      const start = () => {
        signal.removeEventListener("abort", abort);
        if (signal.aborted) return abort();
        this.#active++;
        let released = false;
        resolve(() => {
          if (released) return;
          released = true;
          this.#active--;
          const next = this.#waiting.values().next().value;
          if (next) {
            this.#waiting.delete(next);
            next();
          }
        });
      };
      if (signal.aborted) return abort();
      if (this.#active < 2) start();
      else {
        this.#waiting.add(start);
        signal.addEventListener("abort", abort, { once: true });
      }
    });
  }
}
