// @vitest-environment node
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const source = readFileSync(
  new URL("../public/push-worker.js", import.meta.url),
  "utf8",
);
const message = {
  schema: 1,
  id: "11111111-1111-4111-8111-111111111111",
  gameId: "22222222-2222-4222-8222-222222222222",
  eventSequence: 12,
};
function worker() {
  const listeners = new Map<string, (event: unknown) => void>();
  const showNotification = vi.fn(async () => undefined);
  const matchAll = vi.fn(
    async (): Promise<{ url: string; focus: () => Promise<void> }[]> => [],
  );
  const openWindow = vi.fn(async () => undefined);
  runInNewContext(source, {
    URL,
    self: {
      location: { origin: "https://game.example" },
      registration: { showNotification },
      clients: { matchAll, openWindow },
      addEventListener: (type: string, listener: (event: unknown) => void) => {
        listeners.set(type, listener);
      },
    },
  });
  async function dispatch(type: string, fields: Record<string, unknown>) {
    const waits: Promise<unknown>[] = [];
    listeners.get(type)?.({
      ...fields,
      waitUntil: (p: Promise<unknown>) => waits.push(p),
    });
    await Promise.all(waits);
  }
  return {
    listeners,
    showNotification,
    matchAll,
    openWindow,
    push: (value: unknown) =>
      dispatch("push", { data: { text: () => JSON.stringify(value) } }),
    raw: (text: string) => dispatch("push", { data: { text: () => text } }),
    click: (data: unknown) => {
      const close = vi.fn();
      return dispatch("notificationclick", {
        notification: { data, close },
      }).then(() => close);
    },
  };
}

describe("notification-only service worker", () => {
  it("displays generic content without fetching or intercepting game data", async () => {
    const instance = worker();
    await instance.push(message);
    expect([...instance.listeners.keys()]).toEqual([
      "push",
      "notificationclick",
    ]);
    expect(instance.showNotification).toHaveBeenCalledWith("Gettysburg", {
      body: "A game may be waiting for your decision. Open it to check.",
      tag: `gettysburg-${message.id}`,
      renotify: false,
      data: { gameId: message.gameId },
    });
  });
  it("displays every retry with the same stable tag, including after restart", async () => {
    const first = worker();
    await Promise.all([first.push(message), first.push(message)]);
    expect(first.showNotification).toHaveBeenCalledTimes(2);
    const restarted = worker();
    await restarted.push(message);
    expect(restarted.showNotification.mock.calls).toEqual(
      first.showNotification.mock.calls.slice(0, 1),
    );
  });
  it.each([
    null,
    [],
    {},
    { ...message, schema: 2 },
    { ...message, eventSequence: -1 },
    { ...message, gameId: "//evil.example" },
    { ...message, id: "../secret" },
    { ...message, url: "https://evil.example" },
    { ...message, eventSequence: 1.5 },
  ])("ignores invalid payload %j", async (value) => {
    const instance = worker();
    await instance.push(value);
    expect(instance.showNotification).not.toHaveBeenCalled();
  });
  it("ignores malformed and oversized JSON", async () => {
    const instance = worker();
    await instance.raw("{");
    await instance.raw(" ".repeat(1_025));
    expect(instance.showNotification).not.toHaveBeenCalled();
  });
  it("allows a retry after display failure", async () => {
    const instance = worker();
    instance.showNotification.mockRejectedValueOnce(new Error("unavailable"));
    await expect(instance.push(message)).rejects.toThrow("unavailable");
    await instance.push(message);
    expect(instance.showNotification).toHaveBeenCalledTimes(2);
  });
  it("focuses only the exact same-origin game; otherwise opens its safe route", async () => {
    const instance = worker();
    const focus = vi.fn(async () => undefined);
    const destination = `https://game.example/game/${message.gameId}`;
    instance.matchAll.mockResolvedValueOnce([{ url: destination, focus }]);
    const close = await instance.click({ gameId: message.gameId });
    expect(close).toHaveBeenCalledOnce();
    expect(focus).toHaveBeenCalledOnce();
    expect(instance.openWindow).not.toHaveBeenCalled();
    await instance.click({
      gameId: message.gameId,
      url: "https://evil.example",
    });
    expect(instance.openWindow).toHaveBeenCalledWith(destination);
    await instance.click({ gameId: "https://evil.example" });
    expect(instance.openWindow).toHaveBeenCalledTimes(1);
  });
});
