import assert from "node:assert/strict";
import { resolve } from "node:path";
import { COMMAND_SCHEMA_VERSION } from "../packages/game/dist/index.js";
import { deleteAcceptanceGame } from "./browser-cleanup.mjs";

// Issuance and claim are API fixture setup until the separate observer UI ships.
// Listing, refresh, reload, and both revocations use visible host controls.
export async function checkSpectatorManagement(
  browser,
  origin,
  evidence,
  options,
) {
  const contexts = await Promise.all(
    [0, 1, 2].map(() => browser.newContext({ viewport: options.viewport })),
  );
  const [host, guest, observer] = await Promise.all(
    contexts.map((context) => context.newPage()),
  );
  const issues = [];
  for (const page of [host, guest, observer])
    page.on("pageerror", (error) => issues.push(error.message));
  try {
    await host.goto(origin);
    await host.getByRole("button", { name: "Host as Union" }).click();
    await guest.goto(
      await host.getByLabel("One-time invitation URL").inputValue(),
    );
    await guest.getByRole("button", { name: "Claim seat" }).click();
    for (const page of [host, guest])
      await page.getByText("connected", { exact: true }).waitFor();
    assert.equal(
      await guest
        .getByRole("region", { name: "Spectator access management" })
        .count(),
      0,
    );
    const gameId = new URL(host.url()).pathname.split("/").at(-1);
    const issue = () =>
      host.evaluate(
        async ({ gameId, schema }) => {
          const current = await (await fetch(`/api/games/${gameId}`)).json();
          const response = await fetch(`/api/games/${gameId}/host-commands`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              command_id: crypto.randomUUID(),
              command_name: "issueSpectatorInvitation",
              payload: {},
              expected_version: current.state.version,
              game_id: gameId,
              schema,
            }),
          });
          const result = await response.json();
          if (!response.ok || !result.ok || !result.invitation)
            throw new Error("Spectator fixture issuance failed");
          return result.invitation;
        },
        { gameId, schema: COMMAND_SCHEMA_VERSION },
      );
    const unclaimed = await issue();
    const claimed = await issue();
    const panel = host.getByRole("region", {
      name: "Spectator access management",
    });
    await panel
      .getByRole("button", { name: "Refresh spectator grants" })
      .click();
    await panel.getByText(unclaimed.lookup_id, { exact: true }).waitFor();
    await observer.goto(origin);
    await observer.evaluate(async (invitation) => {
      const response = await fetch(
        `/api/spectator-invitations/${invitation.lookup_id}/claim`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            claim_id: crypto.randomUUID(),
            secret: invitation.secret,
          }),
        },
      );
      if (!response.ok) throw new Error("Spectator fixture claim failed");
    }, claimed);
    const observerStatus = (path) =>
      observer.evaluate(async (path) => (await fetch(path)).status, path);
    assert.equal(await observerStatus(`/api/games/${gameId}/spectator`), 200);
    await host.reload();
    await panel
      .getByText("Claimed; access remains revocable", { exact: false })
      .waitFor();
    await panel.screenshot({
      path: resolve(evidence, `${options.label}-spectator-management.png`),
    });
    await panel
      .getByRole("button", {
        name: `Revoke spectator grant ${unclaimed.lookup_id}`,
        exact: true,
      })
      .click();
    await panel
      .getByText(unclaimed.lookup_id, { exact: true })
      .waitFor({ state: "detached" });
    await panel
      .getByRole("button", {
        name: `Revoke spectator grant ${claimed.lookup_id}`,
        exact: true,
      })
      .click();
    await panel.getByText("No outstanding spectator grants.").waitFor();
    assert.equal(await observerStatus(`/api/games/${gameId}/spectator`), 401);
    assert.equal(await observerStatus(`/api/games/${gameId}/replay`), 401);
    const saved = await host.evaluate(async (gameId) => {
      const response = await fetch(`/api/games/${gameId}`);
      if (!response.ok) throw new Error("Host read-back failed");
      return response.json();
    }, gameId);
    assert.equal(saved.state.version, 0);
    assert.deepEqual(
      saved.action_log.map((event) => event.command_name),
      [
        "issueSpectatorInvitation",
        "issueSpectatorInvitation",
        "revokeSpectatorInvitation",
        "revokeSpectatorAccess",
      ],
    );
    await guest.getByText("connected", { exact: true }).waitFor();
    await deleteAcceptanceGame(host);
    assert.deepEqual(issues, []);
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
}
