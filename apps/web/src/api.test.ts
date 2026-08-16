import { afterEach, describe, expect, it, vi } from "vitest";

import { createGame, resumeGame } from "./api";

describe("API requests", () => {
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

    await expect(createGame("union")).rejects.toThrow("Upstream unavailable");
  });

  it.each(["null", "[]", "true", '"text"'])(
    "rejects a successful non-object JSON response %s",
    async (body) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(new Response(body, { status: 200 })),
      );

      await expect(createGame("union")).rejects.toThrow(
        "Server returned an invalid response.",
      );
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

    const timedOut = expect(createGame("union")).rejects.toMatchObject({
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

    const timedOut = expect(createGame("union")).rejects.toMatchObject({
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
});
