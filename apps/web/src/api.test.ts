import { afterEach, describe, expect, it, vi } from "vitest";

import { createGame, getReplay, resumeGame, sendHostCommand } from "./api";

describe("API requests", () => {
  it("requests an authorized replay cursor with same-origin credentials", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ sequence: 0 }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetcher);
    await getReplay("game/id", 0);
    expect(fetcher).toHaveBeenCalledWith(
      "/api/games/game%2Fid/replay?sequence=0",
      expect.objectContaining({ credentials: "same-origin" }),
    );
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("preserves a useful non-JSON HTTP error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("Upstream unavailable", {
          status: 502,
          statusText: "Bad Gateway",
        }),
      ),
    );

    await expect(
      createGame(
        "union",
        "11111111-1111-4111-8111-111111111111",
        "A".repeat(43),
      ),
    ).rejects.toThrow("Upstream unavailable");
  });

  it.each(["null", "[]", "true", '"text"'])(
    "rejects a successful non-object JSON response %s",
    async (body) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(new Response(body, { status: 200 })),
      );

      await expect(
        createGame(
          "union",
          "11111111-1111-4111-8111-111111111111",
          "A".repeat(43),
        ),
      ).rejects.toThrow("Server returned an invalid response.");
    },
  );

  it("times out a request without AbortSignal.timeout support", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init?: RequestInit) => {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(init.signal?.reason),
            { once: true },
          );
        });
      }),
    );

    const timedOut = expect(
      createGame(
        "union",
        "11111111-1111-4111-8111-111111111111",
        "A".repeat(43),
      ),
    ).rejects.toMatchObject({
      name: "TimeoutError",
    });
    await vi.advanceTimersByTimeAsync(15_000);
    await timedOut;
  });

  it("keeps the timeout active while reading a delayed body", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init?: RequestInit) => {
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () =>
            new Promise<string>((_resolve, reject) => {
              init?.signal?.addEventListener(
                "abort",
                () => reject(init.signal?.reason),
                { once: true },
              );
            }),
        } as Response);
      }),
    );

    const timedOut = expect(
      createGame(
        "union",
        "11111111-1111-4111-8111-111111111111",
        "A".repeat(43),
      ),
    ).rejects.toMatchObject({
      name: "TimeoutError",
    });
    await vi.advanceTimersByTimeAsync(15_000);
    await timedOut;
  });

  it("preserves caller cancellation while reading a response body", async () => {
    const controller = new AbortController();
    let markBodyStarted!: () => void;
    const bodyStarted = new Promise<void>((resolve) => {
      markBodyStarted = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init?: RequestInit) => {
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => {
            markBodyStarted();
            return new Promise<string>((_resolve, reject) => {
              init?.signal?.addEventListener(
                "abort",
                () => reject(init.signal?.reason),
                { once: true },
              );
            });
          },
        } as Response);
      }),
    );

    const cancelled = expect(
      resumeGame("game", controller.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
    await bodyStarted;
    controller.abort(new DOMException("Cancelled", "AbortError"));
    await cancelled;
  });

  it("returns a host-command failure body from an HTTP 200 response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          current_version: 2,
          error: "stale_version",
          message: "Game changed; the latest state has been restored.",
          ok: false,
        }),
      ),
    );

    await expect(
      sendHostCommand("11111111-1111-4111-8111-111111111111", 1, "deleteGame", {
        confirm: true,
      }),
    ).resolves.toMatchObject({
      current_version: 2,
      error: "stale_version",
      ok: false,
    });
  });
});
