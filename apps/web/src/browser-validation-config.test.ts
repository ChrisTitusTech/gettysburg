import { config } from "zod";
import { expect, it } from "vitest";
import "./browser-validation-config";

it("disables optional browser schema JIT without disabling validation", async () => {
  expect(config().jitless).toBe(true);
  const { z } = await import("zod");
  const schema = z.object({ turn: z.number().int().min(1).max(24) });
  expect(schema.safeParse({ turn: 1 }).success).toBe(true);
  expect(schema.safeParse({ turn: 25 }).success).toBe(false);
});
