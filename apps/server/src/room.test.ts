import { describe, expect, it } from "vitest";

import { pruneExpiredCommandWindows } from "./room.js";

describe("command-window pruning", () => {
  it("removes expired bindings while preserving active reconnect limits", () => {
    const windows = new Map([
      ["expired", { count: 30, windowStartedAt: 1_000 }],
      ["active", { count: 30, windowStartedAt: 10_500 }],
    ]);

    pruneExpiredCommandWindows(windows, 11_000);

    expect([...windows]).toEqual([
      ["active", { count: 30, windowStartedAt: 10_500 }],
    ]);
  });
});
