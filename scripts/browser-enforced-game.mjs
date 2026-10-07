import assert from "node:assert/strict";
import { resolve } from "node:path";
import { expect } from "@playwright/test";
import { deleteAcceptanceGame } from "./browser-cleanup.mjs";
import { createCommandPacer } from "./browser-command-pacing.mjs";
import { observeAdmissionDiagnostics } from "./browser-admission.mjs";
import {
  captureScreenshot,
  isScreenshotDiagnostic,
} from "./browser-screenshot.mjs";

// All mutations use player-visible controls. Authenticated reads only verify
// committed results; no fixture state, commands, or dice enter the live server.
export async function runEnforcedGame(browser, origin, evidence, options) {
  const contexts = await Promise.all(
    ["union", "confederate"].map(() =>
      browser.newContext({
        ...options.contextOptions,
        viewport: options.viewport,
        hasTouch: options.inputMode === "touch",
      }),
    ),
  );
  const pages = {
    union: await contexts[0].newPage(),
    confederate: await contexts[1].newPage(),
  };
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    for (const context of contexts) void context.close().catch(() => {});
  }, 480_000);
  const issues = [];
  for (const page of Object.values(pages)) {
    const admissionDiagnostic = observeAdmissionDiagnostics(page);
    page.on("pageerror", (error) => issues.push(error.message));
    page.on("console", (message) => {
      if (isScreenshotDiagnostic(page, message) || admissionDiagnostic(message))
        return;
      if (["error", "warning"].includes(message.type()))
        issues.push(`${message.type()}: ${message.text()}`);
    });
  }
  const activate = async (locator, key = "Enter") => {
    await expect(locator).toBeVisible();
    await expect(locator).toBeEnabled();
    if (options.inputMode === "touch") await locator.tap();
    else await locator.press(key);
  };
  let endpoint;
  let state;
  const read = async (page = pages.union, suffix = "") => {
    // Use the real browser's cookie policy (including Secure loopback cookies),
    // not Playwright's separate HTTP client's cookie handling.
    const response = await page.evaluate(async (url) => {
      const result = await fetch(url, {
        credentials: "same-origin",
        signal: AbortSignal.timeout(15_000),
      });
      return { status: result.status, data: await result.json() };
    }, `${endpoint}${suffix}`);
    assert.equal(response.status, 200, "Authorized state read must succeed");
    return response.data.state;
  };
  const synchronize = async (version) => {
    for (const page of Object.values(pages))
      await page.getByText(`v${version}`, { exact: true }).first().waitFor();
    const results = await Promise.all(
      Object.values(pages).map((page) => read(page)),
    );
    assert.deepEqual(
      results[0],
      results[1],
      "Both seats must see the same saved state",
    );
    assert.equal(results[0].version, version);
    state = results[0];
  };
  const paceCommand = createCommandPacer();
  const commit = async (operation) => {
    await paceCommand();
    const version = state.version;
    await operation();
    await synchronize(version + 1);
  };
  const move = async (side, id, destination) => {
    const unit = state.units[id];
    await activate(
      pages[side].getByRole("button", { name: "Fit", exact: true }),
    );
    await activate(
      pages[side].getByRole("button", {
        name: new RegExp(`^${unit.label}, ${unit.location}, selectable`),
      }),
    );
    await commit(() =>
      activate(pages[side].locator(`[data-coordinate="${destination}"]`)),
    );
    assert.equal(state.units[id].location, destination);
  };
  const end = () =>
    commit(() =>
      activate(
        pages[state.active_side].getByRole("button", {
          name: /^End (movement|combat) phase$/,
        }),
      ),
    );
  try {
    await pages.union.goto(origin);
    await activate(pages.union.getByRole("button", { name: "Host as Union" }));
    const invitation = await pages.union
      .getByLabel("One-time invitation URL")
      .inputValue();
    await pages.confederate.goto(invitation);
    await activate(
      pages.confederate.getByRole("button", { name: "Claim seat" }),
    );
    const gameId = new URL(pages.union.url()).pathname.split("/").at(-1);
    endpoint = `${origin}/api/games/${gameId}`;
    for (const page of Object.values(pages))
      await page.getByText("connected", { exact: true }).waitFor();
    await synchronize(0);
    assert.equal(state.ruleset_version, "gettysburg-mandatory-v4");

    await move("union", "u-gamble", "P3");
    assert.equal(state.units["u-buford"].location, "P3");
    await move("union", "u-devin", "S3");
    await end();
    for (const [id, destination] of [
      ["c-heth", "S2"],
      ["c-pegram", "Q3"],
    ]) {
      const entry = pages.confederate.getByRole("region", {
        name: "Reinforcement entry",
      });
      await activate(
        entry.getByRole("checkbox", {
          name: new RegExp(`^${state.units[id].label} \\(`),
        }),
        "Space",
      );
      await commit(() =>
        activate(entry.getByRole("button", { name: /^Enter selected at S1 / })),
      );
      await move("confederate", id, destination);
    }
    await end();
    const openingCombat = structuredClone(state);
    assert.equal(state.phase, "combat");
    assert.equal(Object.keys(state.combats).length, 2);
    for (const combat of Object.values(state.combats)) {
      assert.equal(combat.status, "awaiting_result_confirmation");
      assert(combat.rolls.attacker >= 1 && combat.rolls.attacker <= 10);
      assert(combat.rolls.defender >= 1 && combat.rolls.defender <= 10);
    }

    // Reload both independent clients while server results await confirmation.
    await Promise.all(Object.values(pages).map((page) => page.reload()));
    for (const page of Object.values(pages))
      await page.getByText("connected", { exact: true }).waitFor();
    await synchronize(openingCombat.version);
    assert.deepEqual(
      state,
      openingCombat,
      "Reload must not reroll pending combat",
    );
    let confirmed = 0;
    const choices = new Set();
    for (let step = 0; state.phase !== "completed" && step < 160; step++) {
      const combat = Object.values(state.combats).find(
        (item) => item.status !== "resolved",
      );
      if (!combat) {
        await end();
        continue;
      }
      const choice = combat.pending_choice;
      const page = pages[choice?.side ?? state.active_side];
      const card = page.locator(".combat-card").filter({
        has: page.getByRole("heading", {
          name: `Skirmish ${combat.id.slice(0, 8)}`,
          exact: true,
        }),
      });
      if (!choice) {
        assert.equal(combat.status, "awaiting_result_confirmation");
        await commit(() =>
          activate(
            card.getByRole("button", { name: "Confirm skirmish result" }),
          ),
        );
        confirmed++;
      } else {
        choices.add(choice.kind);
        if (choice.kind === "loss") {
          let remaining = choice.count;
          for (const id of choice.unit_ids) {
            const loss = Math.min(remaining, state.units[id].steps_remaining);
            await card
              .getByRole("spinbutton", {
                name: state.units[id].label,
                exact: true,
              })
              .fill(String(loss));
            remaining -= loss;
          }
          assert.equal(remaining, 0);
          await commit(() =>
            activate(card.getByRole("button", { name: "Allocate losses" })),
          );
        } else if (choice.kind === "retreat") {
          const retreat = card
            .getByRole("region", { name: /^Retreat from/ })
            .first();
          const suggested = retreat.getByRole("button", {
            name: "Use suggested route",
          });
          if (await suggested.isEnabled()) {
            await activate(suggested);
            await commit(() =>
              activate(
                retreat
                  .getByRole("button", {
                    name: /^Confirm (retreat to|permanent retreat off board)/,
                  })
                  .first(),
              ),
            );
          } else {
            const loss = retreat.getByRole("combobox");
            await loss.selectOption({ index: 1 });
            await commit(() =>
              activate(
                retreat.getByRole("button", {
                  name: "Confirm one extra loss and hold",
                }),
              ),
            );
          }
        } else {
          assert.equal(choice.kind, "advance");
          await commit(() =>
            activate(
              card.getByRole("button", { name: "Decline this advance" }),
            ),
          );
        }
      }
    }
    assert.equal(
      state.phase,
      "completed",
      "The bounded game must finish without database intervention",
    );
    assert.equal(state.turn, 24);
    assert(confirmed >= 2);
    assert.notEqual(state.victory.status, "in-progress");
    assert.deepEqual(await read(pages.union, "/replay"), state);
    assert.deepEqual(
      await read(
        pages.confederate,
        `/replay?sequence=${openingCombat.event_sequence}`,
      ),
      openingCombat,
    );
    for (const page of Object.values(pages))
      await page
        .getByRole("heading", { name: /Turn 24 · completed/ })
        .waitFor();
    await captureScreenshot(pages.union, pages.union.locator("main"), {
      mask: [pages.union.getByLabel("One-time invitation URL")],
      path: resolve(evidence, `${options.label}-enforced-game-complete.png`),
    });
    await deleteAcceptanceGame(pages.union);
    assert.deepEqual(issues, []);
    console.log(
      `${options.label}: completed turn 24, ${confirmed} combats, choices ${[...choices].join(", ")}; pending-result reload and exact replay passed`,
    );
  } catch (error) {
    throw new Error(
      `${options.label} enforced game ${timedOut ? "exceeded eight minutes" : "failed"} at turn ${state?.turn}, ${state?.phase}, v${state?.version}`,
      { cause: error },
    );
  } finally {
    clearTimeout(timeout);
    await Promise.all(
      contexts.map((context) => context.close().catch(() => {})),
    );
  }
}
