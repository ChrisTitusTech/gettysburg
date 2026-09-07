import { describe, expect, it, vi } from "vitest";
import { createSerialOperations } from "./serial-operations";

describe("shared host-operation serialization", () => {
  it("waits through response application before starting another host command", async () => {
    const serialize = createSerialOperations();
    let finish!: (value: string) => void;
    const delayed = new Promise<string>((resolve) => {
      finish = resolve;
    });
    const calls: string[] = [];
    const first = serialize(async () => {
      calls.push("revoke");
      const result = await delayed;
      calls.push("apply revoke");
      return result;
    });
    const next = vi.fn(async () => {
      calls.push("issue");
      return "issued";
    });
    const second = serialize(next);
    await Promise.resolve();
    expect(next).not.toHaveBeenCalled();
    finish("revoked");
    expect(await first).toBe("revoked");
    expect(await second).toBe("issued");
    expect(calls).toEqual(["revoke", "apply revoke", "issue"]);
  });
  it("releases the queue after failures without swallowing the caller's error", async () => {
    const serialize = createSerialOperations();
    const failed = serialize(async () => {
      throw new Error("unavailable");
    });
    const next = serialize(async () => "recovered");
    await expect(failed).rejects.toThrow("unavailable");
    expect(await next).toBe("recovered");
  });
});
