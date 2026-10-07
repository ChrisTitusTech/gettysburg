import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { setTimeout as delay } from "node:timers/promises";

export interface CreationAdmission {
  status(): "available" | "busy" | "unavailable";
}

interface ResourceSample {
  readonly cpuTotal: number;
  readonly cpuIdle: number;
  readonly memoryUsed: number;
}

// Linux procfs exposes host-wide counters in our rootless Podman deployment.
// Do not use process CPU/RSS, load average, or MemFree as host utilization.
export function parseResourceSample(
  stat: string,
  meminfo: string,
): ResourceSample {
  const fields = /^cpu\s+(.+)$/m
    .exec(stat)?.[1]
    ?.trim()
    .split(/\s+/)
    .map(Number);
  const totalMemory = Number(/^MemTotal:\s+(\d+) kB$/m.exec(meminfo)?.[1]);
  const availableMemory = Number(
    /^MemAvailable:\s+(\d+) kB$/m.exec(meminfo)?.[1],
  );
  if (
    !fields ||
    fields.length < 8 ||
    fields.some((value) => !Number.isSafeInteger(value) || value < 0) ||
    !Number.isSafeInteger(totalMemory) ||
    totalMemory <= 0 ||
    !Number.isSafeInteger(availableMemory) ||
    availableMemory < 0 ||
    availableMemory > totalMemory
  )
    throw new Error("Invalid host resource counters");
  // Guest ticks are already included in user/nice, so sum only the first eight.
  return {
    cpuTotal: fields.slice(0, 8).reduce((sum, value) => sum + value, 0),
    cpuIdle: fields[3]! + fields[4]!,
    memoryUsed: (totalMemory - availableMemory) / totalMemory,
  };
}

export class HostCreationAdmission implements CreationAdmission {
  #previous: ResourceSample | undefined;
  #status: ReturnType<CreationAdmission["status"]> = "unavailable";
  #sampledAt = -Infinity;

  constructor(
    private readonly readSample = () =>
      parseResourceSample(
        readFileSync("/proc/stat", "utf8"),
        readFileSync("/proc/meminfo", "utf8"),
      ),
    private readonly now = () => performance.now(),
  ) {}

  sample(): void {
    try {
      const current = this.readSample();
      const previous = this.#previous;
      this.#previous = current;
      this.#sampledAt = this.now();
      const total = current.cpuTotal - (previous?.cpuTotal ?? current.cpuTotal);
      const idle = current.cpuIdle - (previous?.cpuIdle ?? current.cpuIdle);
      // Require two valid samples, including after a counter reset or failure.
      if (!previous || total <= 0 || idle < 0 || idle > total) {
        this.#status = "unavailable";
        return;
      }
      const cpuUsed = (total - idle) / total;
      this.#status =
        cpuUsed >= 0.9 || current.memoryUsed >= 0.9 ? "busy" : "available";
    } catch {
      this.#previous = undefined;
      this.#status = "unavailable";
    }
  }

  status(): ReturnType<CreationAdmission["status"]> {
    return this.now() - this.#sampledAt > 5_000 ? "unavailable" : this.#status;
  }
}

export async function startCreationAdmission(): Promise<
  CreationAdmission & { stop(): void }
> {
  const monitor = new HostCreationAdmission();
  monitor.sample();
  // Finish the CPU baseline before listening, avoiding a false overload on boot.
  await delay(1_000);
  monitor.sample();
  const timer = setInterval(() => monitor.sample(), 1_000);
  timer.unref();
  return { status: () => monitor.status(), stop: () => clearInterval(timer) };
}
