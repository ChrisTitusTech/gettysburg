export function pushSupportProblem(): string | null {
  if (!window.isSecureContext)
    return "Notifications require a secure HTTPS connection.";
  if (
    !("serviceWorker" in navigator) ||
    !("PushManager" in window) ||
    !("Notification" in window)
  )
    return "This browser does not support push here. On iPhone or iPad, add this site to the Home Screen and open it there.";
  if (Notification.permission === "denied")
    return "Notifications are blocked in browser settings. Allow them there before trying again.";
  return null;
}

export class PushSetupError extends Error {}

function untilAbort<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    operation
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", abort));
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
  });
}

// Call directly from the user's click, before any unrelated asynchronous work.
export async function subscribeThisBrowser(
  publicKey: string,
  signal: AbortSignal,
): Promise<PushSubscriptionJSON> {
  const problem = pushSupportProblem();
  if (problem !== null) throw new PushSetupError(problem);
  signal.throwIfAborted();
  const permission = await untilAbort(Notification.requestPermission(), signal);
  if (permission !== "granted")
    throw new PushSetupError(
      "Notification permission was not granted. You can try again from browser settings.",
    );
  signal.throwIfAborted();
  const deadline = AbortSignal.any([signal, AbortSignal.timeout(20_000)]);
  const key = Uint8Array.from(
    atob(publicKey.replaceAll("-", "+").replaceAll("_", "/")),
    (c) => c.charCodeAt(0),
  );
  const registration = await untilAbort(
    navigator.serviceWorker.register("/push-worker.js", {
      scope: "/",
      updateViaCache: "none",
    }),
    deadline,
  );
  await untilAbort(navigator.serviceWorker.ready, deadline);
  deadline.throwIfAborted();
  let subscription = await untilAbort(
    registration.pushManager.getSubscription(),
    deadline,
  );
  if (subscription !== null) {
    const existing = subscription.options.applicationServerKey;
    if (
      existing === null ||
      new Uint8Array(existing).length !== key.length ||
      !new Uint8Array(existing).every((byte, index) => byte === key[index])
    )
      throw new PushSetupError(
        "This browser uses an older notification key. Reset this site's notification permission in browser settings, then try again.",
      );
  } else {
    subscription = await untilAbort(
      registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: key,
      }),
      deadline,
    );
  }
  deadline.throwIfAborted();
  return subscription.toJSON();
}
