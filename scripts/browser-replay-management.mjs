import assert from "node:assert/strict";
import { resolve } from "node:path";
import { deleteAcceptanceGame } from "./browser-cleanup.mjs";
import { observeAdmissionDiagnostics } from "./browser-admission.mjs";
import {
  captureScreenshot,
  isScreenshotDiagnostic,
} from "./browser-screenshot.mjs";

export async function checkReplayManagement(
  browser,
  origin,
  evidence,
  options,
) {
  const hostContext = await browser.newContext({
    ...options.contextOptions,
    viewport: options.viewport,
  });
  const guestContext = await browser.newContext({
    ...options.contextOptions,
    viewport: options.viewport,
  });
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();
  const issues = [];
  for (const page of [host, guest]) {
    const admissionDiagnostic = observeAdmissionDiagnostics(page);
    page.on("pageerror", (error) => issues.push(error.message));
    page.on("console", (message) => {
      if (isScreenshotDiagnostic(page, message) || admissionDiagnostic(message))
        return;
      if (["error", "warning"].includes(message.type()))
        issues.push(message.text());
    });
  }
  try {
    await host.goto(origin);
    await host.getByRole("button", { name: "Host as Confederate" }).click();
    await guest.goto(
      await host.getByLabel("One-time invitation URL").inputValue(),
    );
    await guest.getByRole("button", { name: "Claim seat" }).click();
    for (const page of [host, guest])
      await page.getByText("connected", { exact: true }).waitFor();
    host.once("dialog", (dialog) => dialog.accept());
    await host.getByRole("button", { name: "Surrender seat" }).click();
    await host
      .getByRole("heading", { name: "Host controls recovered" })
      .waitFor();
    await guest.getByText("v1", { exact: true }).first().waitFor();
    await guest
      .getByRole("button", { name: "View replay", exact: true })
      .click();
    const replay = guest.getByRole("region", { name: "Read-only game replay" });
    await replay
      .getByText("Viewing event 0 of 1. Turn 1, movement, state v0.")
      .waitFor();
    await replay.getByRole("button", { name: "Latest event" }).click();
    await replay.getByText(/Viewing event 1 of 1/).waitFor();
    await host
      .getByRole("button", {
        name: "Issue Confederate invitation",
        exact: true,
      })
      .click();
    await replay.getByText(/Viewing event 1 of 2/).waitFor();
    await replay.getByRole("button", { name: "Next event" }).click();
    await replay.getByText(/Viewing event 2 of 2/).waitFor();
    await host
      .getByRole("button", {
        name: "Revoke Confederate invitation",
        exact: true,
      })
      .click();
    await replay.getByText(/Viewing event 2 of 3/).waitFor();
    await replay.getByRole("button", { name: "Next event" }).click();
    await replay.getByText(/Viewing event 3 of 3/).waitFor();
    await guest.getByText("v1", { exact: true }).first().waitFor();
    await captureScreenshot(
      guest,
      guest.getByRole("region", { name: "Replay controls", exact: true }),
      {
        path: resolve(evidence, `${options.label}-replay-management.png`),
      },
    );
    await deleteAcceptanceGame(host);
    assert.deepEqual(issues, []);
  } finally {
    await Promise.all(
      [hostContext, guestContext].map((context) =>
        context.close().catch(() => {}),
      ),
    );
  }
}
