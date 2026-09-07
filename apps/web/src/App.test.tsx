import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";

describe("App", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/");
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("offers both host seats from the initial lobby", () => {
    render(<App />);

    expect(
      screen.getByRole("group", { name: "Choose a host seat" }),
    ).toBeVisible();

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

  it("does not offer to host a new game from an unowned game URL", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => undefined)),
    );
    window.history.replaceState(
      null,
      "",
      "/game/11111111-1111-4111-8111-111111111111",
    );

    render(<App />);

    expect(
      screen.getByRole("heading", { name: "Seat invitation required" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Host as Union" }),
    ).not.toBeInTheDocument();
  });
});
