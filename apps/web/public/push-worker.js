// Notifications only: never intercept requests or cache game/session responses.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
let pending = Promise.resolve();

function validMessage(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    value.schema === 1 &&
    typeof value.id === "string" &&
    UUID.test(value.id) &&
    typeof value.gameId === "string" &&
    UUID.test(value.gameId) &&
    Number.isSafeInteger(value.eventSequence) &&
    value.eventSequence >= 0 &&
    Object.keys(value).length === 4
  );
}

async function receive(message) {
  // Every valid push must display, including retries. Stable tags replace an
  // existing card without renotifying; silent deduplication violates Web Push.
  await self.registration.showNotification("Gettysburg", {
    body: "A game may be waiting for your decision. Open it to check.",
    tag: `gettysburg-${message.id}`,
    renotify: false,
    data: { gameId: message.gameId },
  });
}

self.addEventListener("push", (event) => {
  let message;
  try {
    const raw = event.data?.text();
    if (raw === undefined || raw.length > 1_024) return;
    message = JSON.parse(raw);
    if (!validMessage(message)) return;
  } catch {
    return;
  }
  pending = pending.catch(() => undefined).then(() => receive(message));
  event.waitUntil(pending);
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const gameId = event.notification.data?.gameId;
  if (typeof gameId !== "string" || !UUID.test(gameId)) return;
  const destination = new URL(`/game/${gameId}`, self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const existing = windows.find((client) => client.url === destination);
      if (existing !== undefined) await existing.focus();
      else await self.clients.openWindow(destination);
    })(),
  );
});
