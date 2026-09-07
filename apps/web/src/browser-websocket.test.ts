import { afterEach, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

it("opens a browser socket without probing the Node-only options argument", async () => {
  const calls: unknown[][] = [];
  class BrowserSocket {
    static OPEN = 1;
    readyState = 1;
    constructor(...args: unknown[]) {
      calls.push(args);
      if (typeof args[1] === "object") throw new Error("Invalid protocol");
    }
  }
  vi.stubGlobal("WebSocket", BrowserSocket);
  const { WebSocketTransport } =
    await import("@colyseus/sdk/transport/WebSocketTransport");
  const transport = new WebSocketTransport({});
  transport.connect("wss://example.test/game");
  expect(calls).toEqual([["wss://example.test/game", undefined]]);
  expect(transport.isOpen).toBe(true);
});
