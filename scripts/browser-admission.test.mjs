import assert from "node:assert/strict";
import test from "node:test";
import { observeAdmissionDiagnostics } from "./browser-admission.mjs";

function fixture() {
  let onResponse;
  let time = 100;
  const reports = [];
  const endpoint = "https://game.example/matchmake/joinOrCreate/game";
  const classify = observeAdmissionDiagnostics(
    {
      url: () => "https://game.example/game/current",
      on: (event, listener) => {
        assert.equal(event, "response");
        onResponse = listener;
      },
    },
    { now: () => time, report: (message) => reports.push(message) },
  );
  const response = (status = 503, url = endpoint, method = "POST") =>
    onResponse({
      status: () => status,
      url: () => url,
      request: () => ({ method: () => method }),
    });
  const message = {
    type: () => "error",
    text: () =>
      "Failed to load resource: the server responded with a status of 503 ()",
    location: () => ({ url: endpoint }),
  };
  return {
    classify,
    response,
    message,
    reports,
    endpoint,
    advance: () => {
      time += 5_001;
    },
  };
}

test("one observed admission 503 permits exactly one diagnostic and records it", () => {
  const f = fixture();
  assert.equal(f.classify(f.message), false);
  f.response();
  assert.equal(f.classify(f.message), true);
  assert.equal(f.classify(f.message), false);
  assert.equal(f.reports.length, 1);
  assert.match(
    f.reports[0],
    /successful connection assertions remain required/,
  );
});

test("unrelated HTTP failures and unobserved or stale messages remain errors", () => {
  for (const [status, url, method] of [
    [500, undefined, "POST"],
    [401, undefined, "POST"],
    [429, undefined, "POST"],
    [503, undefined, "GET"],
    [503, "https://other.example/matchmake/joinOrCreate/game", "POST"],
    [503, "https://game.example/api/games/current", "POST"],
    [
      503,
      "https://game.example/matchmake/joinOrCreate/game?unexpected=true",
      "POST",
    ],
  ]) {
    const f = fixture();
    f.response(status, url, method);
    assert.equal(f.classify(f.message), false);
  }
  const f = fixture();
  f.response();
  f.advance();
  assert.equal(f.classify(f.message), false);
});

test("matching responses do not excuse other console locations, types or errors", () => {
  const f = fixture();
  f.response();
  for (const override of [
    { type: () => "warning" },
    { text: () => "Application error" },
    {
      text: () =>
        "Failed to load resource: the server responded with a status of 500 ()",
    },
    { location: () => ({ url: "https://game.example/api/games/current" }) },
    {
      location: () => ({
        url: "https://other.example/matchmake/joinOrCreate/game",
      }),
    },
    { location: () => ({ url: "" }) },
  ])
    assert.equal(f.classify({ ...f.message, ...override }), false);
  assert.equal(f.classify(f.message), true);
});
