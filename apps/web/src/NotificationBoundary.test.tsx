import { lazy, Suspense } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NotificationBoundary } from "./NotificationBoundary";

describe("optional notification failure isolation", () => {
  it("keeps gameplay mounted when a lazy notification import rejects", async () => {
    const LazyFailure = lazy(() => Promise.reject(new Error("chunk missing")));
    const diagnostic = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      render(
        <>
          <button>Move counter</button>
          <NotificationBoundary>
            <Suspense fallback={<p>Loading</p>}>
              <LazyFailure />
            </Suspense>
          </NotificationBoundary>
        </>,
      );
      expect(await screen.findByRole("status")).toHaveTextContent(
        "You can keep playing",
      );
      expect(
        screen.getByRole("button", { name: "Move counter" }),
      ).toBeVisible();
      expect(screen.queryByText("chunk missing")).not.toBeInTheDocument();
    } finally {
      diagnostic.mockRestore();
    }
  });

  it("renders working notification controls normally", () => {
    render(
      <NotificationBoundary>
        <button>Enable notifications</button>
      </NotificationBoundary>,
    );
    expect(screen.getByRole("button")).toBeVisible();
  });
});
