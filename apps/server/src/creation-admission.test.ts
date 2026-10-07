import { describe, expect, it, vi } from "vitest";
import {
  HostCreationAdmission,
  parseResourceSample,
  startCreationAdmission,
} from "./creation-admission.js";

describe("host creation admission", () => {
  it("uses available RAM and excludes double-counted guest CPU ticks", () => {
    expect(
      parseResourceSample(
        "cpu  10 20 30 40 50 60 70 80 100 100\ncpu0 0",
        "MemTotal: 1000 kB\nMemFree: 1 kB\nMemAvailable: 500 kB\n",
      ),
    ).toEqual({
      cpuTotal: 360,
      cpuIdle: 90,
      memoryUsed: 0.5,
    });
  });

  it.each([
    ["cpu 1 2 3", "MemTotal: 100 kB\nMemAvailable: 50 kB"],
    ["cpu 1 2 3 4 5 6 7 nope", "MemTotal: 100 kB\nMemAvailable: 50 kB"],
    ["cpu 1 2 3 4 5 6 7 8", "MemTotal: 0 kB\nMemAvailable: 0 kB"],
    ["cpu 1 2 3 4 5 6 7 8", "MemTotal: 100 kB\nMemAvailable: 101 kB"],
    ["cpu 1 2 3 4 5 6 7 8", "MemTotal: 100 kB"],
  ])("rejects unusable telemetry", (stat, memory) => {
    expect(() => parseResourceSample(stat, memory)).toThrow(
      "Invalid host resource counters",
    );
  });

  it.each([
    [0.899, 0.899, "available"],
    [0.9, 0.1, "busy"],
    [0.1, 0.9, "busy"],
    [1, 1, "busy"],
  ] as const)(
    "gates CPU %s and memory %s at exactly 90%%",
    (cpu, memory, expected) => {
      let current = { cpuTotal: 1000, cpuIdle: 0, memoryUsed: memory };
      const monitor = new HostCreationAdmission(() => current);
      monitor.sample();
      expect(monitor.status()).toBe("unavailable");
      current = {
        cpuTotal: 2000,
        cpuIdle: Math.round(1000 * (1 - cpu)),
        memoryUsed: memory,
      };
      monitor.sample();
      expect(monitor.status()).toBe(expected);
      current = {
        cpuTotal: 3000,
        cpuIdle: current.cpuIdle + 900,
        memoryUsed: 0.1,
      };
      monitor.sample();
      expect(monitor.status()).toBe("available");
    },
  );

  it("does not retain a stale healthy reading after sampling failures or counter resets", () => {
    let now = 0;
    let current = { cpuTotal: 1000, cpuIdle: 1000, memoryUsed: 0.1 };
    const read = vi.fn(() => current);
    const monitor = new HostCreationAdmission(read, () => now);
    monitor.sample();
    current = { ...current, cpuTotal: 2000, cpuIdle: 1900 };
    monitor.sample();
    expect(monitor.status()).toBe("available");
    now = 5001;
    expect(monitor.status()).toBe("unavailable");
    read.mockImplementationOnce(() => {
      throw new Error("unreadable");
    });
    monitor.sample();
    expect(monitor.status()).toBe("unavailable");
    monitor.sample();
    expect(monitor.status()).toBe("unavailable");
    current = { ...current, cpuTotal: 3000, cpuIdle: 2800 };
    monitor.sample();
    expect(monitor.status()).toBe("available");
    current = { ...current, cpuTotal: 1000, cpuIdle: 1000 };
    monitor.sample();
    expect(monitor.status()).toBe("unavailable");
  });

  it("stops its sampler at shutdown", async () => {
    vi.useFakeTimers();
    try {
      const starting = startCreationAdmission();
      await vi.advanceTimersByTimeAsync(1_000);
      const monitor = await starting;
      expect(vi.getTimerCount()).toBe(1);
      monitor.stop();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
