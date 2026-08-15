import { describe, expect, it } from "vitest";

import { App } from "./App";

describe("App", () => {
  it("exports the Phase 1 application shell", () => {
    expect(App).toBeTypeOf("function");
  });
});
