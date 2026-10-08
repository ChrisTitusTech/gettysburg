import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { GameMenu } from "./GameMenu";

function Tools({ available = true }: { available?: boolean }) {
  const [active, setActive] = useState<string | null>(null);
  return (
    <>
      {["Notifications", "Seat options"].map((label) => (
        <GameMenu
          key={label}
          label={label}
          available={available}
          open={active === label}
          onOpenChange={(open) => setActive(open ? label : null)}
        >
          {(closeMenu) => <button onClick={closeMenu}>{label} action</button>}
        </GameMenu>
      ))}
      <button>Board</button>
    </>
  );
}

describe("game toolbar disclosures", () => {
  it("removes unavailable tools and clears their open state before they return", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Tools />);
    await user.click(screen.getByRole("button", { name: "Notifications" }));
    expect(
      screen.getByRole("button", { name: "Notifications action" }),
    ).toBeVisible();
    rerender(<Tools available={false} />);
    expect(screen.queryByRole("button", { name: "Notifications" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Seat options" })).toBeNull();
    rerender(<Tools />);
    expect(
      screen.getByRole("button", { name: "Notifications" }),
    ).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByRole("button", { name: "Notifications action" }),
    ).toBeNull();
  });
  it("restores trigger focus when a keyboard action closes its panel", async () => {
    const user = userEvent.setup();
    render(<Tools />);
    const trigger = screen.getByRole("button", { name: "Seat options" });
    await user.click(trigger);
    await user.tab();
    expect(
      screen.getByRole("button", { name: "Seat options action" }),
    ).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    await user.tab();
    expect(screen.getByRole("button", { name: "Board" })).toHaveFocus();
  });
  it("starts collapsed, switches panels, and restores focus on Escape", async () => {
    const user = userEvent.setup();
    render(<Tools />);
    expect(
      screen.queryByRole("button", { name: "Notifications action" }),
    ).toBeNull();
    await user.click(screen.getByRole("button", { name: "Notifications" }));
    expect(
      screen.getByRole("button", { name: "Notifications action" }),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Seat options" }));
    expect(
      screen.queryByRole("button", { name: "Notifications action" }),
    ).toBeNull();
    await user.tab();
    expect(
      screen.getByRole("button", { name: "Seat options action" }),
    ).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: "Seat options" })).toHaveFocus();
    expect(
      screen.queryByRole("button", { name: "Seat options action" }),
    ).toBeNull();
  });
  it("dismisses on outside click and when tabbing out without trapping focus", async () => {
    const user = userEvent.setup();
    render(<Tools />);
    const trigger = screen.getByRole("button", {
      name: "Seat options",
    });
    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: "Board" }));
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    await user.click(trigger);
    await user.tab();
    await user.tab();
    expect(screen.getByRole("button", { name: "Board" })).toHaveFocus();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });
  it("handles Escape after an asynchronous control loses focus", async () => {
    const user = userEvent.setup();
    render(<Tools />);
    const trigger = screen.getByRole("button", { name: "Notifications" });
    await user.click(trigger);
    trigger.blur();
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveFocus();
  });
});
