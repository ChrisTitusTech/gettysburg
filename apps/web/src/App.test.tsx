import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { App } from "./App";

describe("App", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/");
    window.localStorage.clear();
  });

  it("offers both host seats from the initial lobby", () => {
    render(<App />);

    expect(
      screen.getByRole("button", { name: "Host as Confederate" }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Host as Union" })).toBeVisible();
  });

  it("shows a scrubbed private invitation claim", () => {
    render(
      <App
        initialInvitation={{ lookupId: "lookup", secret: "s".repeat(43) }}
      />,
    );

    expect(screen.getByRole("button", { name: "Claim seat" })).toBeVisible();
  });
});
