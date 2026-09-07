import assert from "node:assert/strict";
import { test } from "node:test";
import { createCommandPacer } from "./browser-command-pacing.mjs";

function fixture() {
  let clock = 0;
  const waits = [];
  const pace = createCommandPacer({
    now: () => clock,
    wait: async (delay) => {
      waits.push(delay);
      clock += delay;
    },
  });
  return {
    pace,
    waits,
    now: () => clock,
    advance: (delay) => {
      clock += delay;
    },
  };
}

test("the first command needs no delay", async () => {
  const f = fixture();
  await f.pace();
  assert.deepEqual(f.waits, []);
});

test("fast sequential commands stay below the room limit in every ten-second window", async () => {
  const f = fixture();
  const times = [];
  for (let count = 0; count < 100; count++) {
    await f.pace();
    times.push(f.now());
  }
  for (const start of times)
    assert(
      times.filter((time) => time >= start && time < start + 10_000).length <=
        25,
    );
  assert(f.waits.every((delay) => delay === 400));
});

test("UI and persistence work count toward the pacing interval", async () => {
  const f = fixture();
  await f.pace();
  f.advance(300);
  await f.pace();
  assert.deepEqual(f.waits, [100]);
  f.advance(500);
  await f.pace();
  assert.deepEqual(f.waits, [100]);
});
