import { setTimeout as delay } from "node:timers/promises";
import type { GameService } from "./postgres-store.js";
import { createPushProvider, type PushVapidDetails } from "./push-provider.js";
import type { PushDelivery } from "./game-service.js";
import type { PushDeliveryOutcome } from "./push-outbox.js";

type WorkerStore = Pick<
  GameService,
  "claimPushDelivery" | "finishPushDelivery" | "authorizePushDelivery"
>;
type Sender = (
  delivery: PushDelivery,
  signal: AbortSignal,
) => Promise<PushDeliveryOutcome>;

// Startup remains a separate configuration gate. Call only after migrations and
// readiness succeed; stop before closing the database pools.
export function startPushWorker(
  store: WorkerStore,
  vapid: PushVapidDetails,
  options: { readonly send?: Sender; readonly onFailure?: () => void } = {},
) {
  const controller = new AbortController();
  const { signal } = controller;
  const send =
    options.send ??
    createPushProvider(vapid, (intent, begin, dispatchSignal) =>
      store.authorizePushDelivery(
        intent.id,
        intent.leaseToken!,
        begin,
        dispatchSignal,
      ),
    );
  const stopped = (async () => {
    while (!signal.aborted) {
      try {
        const delivery = await store.claimPushDelivery(signal);
        if (delivery && !signal.aborted) {
          const outcome = await send(delivery, signal);
          if (!signal.aborted)
            await store.finishPushDelivery(
              delivery.intent.id,
              delivery.intent.leaseToken!,
              outcome,
              signal,
            );
        }
      } catch {
        if (!signal.aborted) {
          try {
            options.onFailure?.();
          } catch {
            /* Telemetry cannot stop delivery. */
          }
        } // Coarse status only, no secrets.
      }
      if (!signal.aborted) {
        try {
          await delay(5_000, undefined, { signal });
        } catch {
          /* Shutdown. */
        }
      }
    }
  })();
  return {
    async stop() {
      controller.abort();
      await stopped;
    },
  };
}
