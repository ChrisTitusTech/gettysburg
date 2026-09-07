import { Resolver } from "node:dns/promises";
import { request } from "node:https";
import { isIP } from "node:net";
import ipaddr from "ipaddr.js";
import webPush from "web-push";
import type { PushDelivery } from "./game-service.js";
import type { PushDeliveryOutcome, StoredPushIntent } from "./push-outbox.js";
import { parsePushSubscription } from "./push-subscription.js";

export interface PushVapidDetails {
  readonly subject: string;
  readonly publicKey: string;
  readonly privateKey: string;
}

export function publicPushAddress(address: string): boolean {
  if (isIP(address) === 0) return false;
  const parsed = ipaddr.parse(address);
  return (
    parsed.range() === "unicast" &&
    (parsed.kind() === "ipv4" || parsed.match(ipaddr.parse("2000::"), 3))
  );
}

async function resolveAddresses(
  host: string,
  signal: AbortSignal,
): Promise<string[]> {
  signal.throwIfAborted();
  const resolver = new Resolver({ timeout: 2_000, tries: 1 });
  const cancel = () => resolver.cancel();
  signal.addEventListener("abort", cancel, { once: true });
  try {
    const answers = await Promise.allSettled([
      resolver.resolve4(host),
      resolver.resolve6(host),
    ]);
    signal.throwIfAborted();
    const addresses: string[] = [];
    for (const answer of answers) {
      if (answer.status === "fulfilled") addresses.push(...answer.value);
      else if ((answer.reason as NodeJS.ErrnoException).code !== "ENODATA")
        throw new Error("Push provider resolution failed.");
    }
    return addresses;
  } finally {
    signal.removeEventListener("abort", cancel);
  }
}

interface ProviderDependencies {
  readonly resolve?: typeof resolveAddresses;
  readonly request?: typeof request;
  readonly now?: () => number;
}

// No scheduler or startup caller yet. Authorization must invoke begin
// synchronously while holding the current consent/lease read lock. The lock
// covers request dispatch, not the asynchronous provider response.
export function createPushProvider(
  vapid: PushVapidDetails,
  authorize: (
    intent: StoredPushIntent,
    begin: () => void,
    signal: AbortSignal,
  ) => Promise<void>,
  dependencies: ProviderDependencies = {},
) {
  const resolve = dependencies.resolve ?? resolveAddresses;
  const send = dependencies.request ?? request;
  const now = dependencies.now ?? Date.now;
  return async (
    delivery: PushDelivery,
    shutdown?: AbortSignal,
  ): Promise<PushDeliveryOutcome> => {
    const controller = new AbortController();
    // Total deadline includes resolution and TLS, not merely socket inactivity.
    const timeout = setTimeout(
      () => controller.abort(),
      Math.max(
        0,
        Math.min(
          10_000,
          delivery.intent.expiresAt - now(),
          (delivery.intent.leaseExpiresAt ?? 0) - now(),
        ),
      ),
    );
    const signal = shutdown
      ? AbortSignal.any([controller.signal, shutdown])
      : controller.signal;
    try {
      signal.throwIfAborted();
      const { intent } = delivery;
      const remaining =
        Math.min(intent.expiresAt, intent.leaseExpiresAt ?? 0) - now();
      if (remaining <= 0) return "retry";
      const subscription = parsePushSubscription(delivery.subscription);
      const endpoint = new URL(subscription.endpoint);
      const addresses = await resolve(endpoint.hostname, signal);
      signal.throwIfAborted();
      if (
        addresses.length === 0 ||
        addresses.length > 64 ||
        !addresses.every(publicPushAddress)
      )
        return "retry";
      if (now() >= Math.min(intent.expiresAt, intent.leaseExpiresAt ?? 0))
        return "retry";
      const selected =
        addresses.find((address) => isIP(address) === 4) ?? addresses[0]!;
      const details = webPush.generateRequestDetails(
        subscription,
        JSON.stringify({
          schema: 1,
          id: intent.id,
          gameId: intent.gameId,
          eventSequence: intent.eventSequence,
        }),
        {
          vapidDetails: vapid,
          contentEncoding: "aes128gcm",
          TTL: Math.max(0, Math.floor((intent.expiresAt - now()) / 1_000)),
          urgency: "normal",
          topic: intent.id.replaceAll("-", ""),
        },
      );
      let result: Promise<PushDeliveryOutcome> | undefined;
      await authorize(
        intent,
        () => {
          signal.throwIfAborted();
          if (
            result ||
            now() >= Math.min(intent.expiresAt, intent.leaseExpiresAt ?? 0)
          )
            return;
          result = new Promise<PushDeliveryOutcome>((done) => {
            const outgoing = send(
              endpoint,
              {
                method: "POST",
                headers: details.headers,
                agent: false,
                family: isIP(selected),
                servername: endpoint.hostname,
                rejectUnauthorized: true,
                signal,
                maxHeaderSize: 16_384,
                // Pin the checked address. Keep the original authority for Host/SNI
                // and Node's normal certificate hostname verification. No proxy or
                // redirect processing and no second, unchecked DNS lookup.
                lookup: (_host, _options, callback) =>
                  callback(null, selected, isIP(selected)),
              },
              (response) => {
                const status = response.statusCode ?? 0;
                response.on("error", () => undefined);
                response.destroy(); // Never retain opaque provider bodies or secrets.
                done(
                  status >= 200 && status < 300
                    ? "sent"
                    : status === 404 || status === 410
                      ? "gone"
                      : "retry",
                );
              },
            );
            outgoing.on("error", () => done("retry"));
            outgoing.end(details.body);
          });
        },
        signal,
      );
      return result ? await result : "retry";
    } catch {
      // Do not leak endpoints, subscription keys, VAPID, or provider responses.
      return "retry";
    } finally {
      controller.abort();
      clearTimeout(timeout);
    }
  };
}
