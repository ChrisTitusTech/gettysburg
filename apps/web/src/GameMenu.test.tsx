import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { GameMenu } from "./GameMenu";

function Tools() {
  const [active, setActive] = useState<string | null>(null);
  return (
    <>
      {["Notifications", "Seat options"].map((label) => (
        <GameMenu
          key={label}
          label={label}
          open={active === label}
          onOpenChange={(open) => setActive(open ? label : null)}
        >
          <button>{label} action</button>
        </GameMenu>
      ))}
      <button>Board</button>
    </>
  );
}

describe("game toolbar disclosures", () => {
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
