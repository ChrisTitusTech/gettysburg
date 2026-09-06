import assert from "node:assert/strict";

export async function deleteAcceptanceGame(page) {
  const location = new URL(page.url());
  const gameId = /^\/game\/([0-9a-f-]{36})$/.exec(location.pathname)?.[1];
  assert(gameId, "Cleanup requires the acceptance game's URL");
  const endpoint = `${location.origin}/api/games/${gameId}`;

  page.once("dialog", (dialog) => dialog.accept());
  const [response] = await Promise.all([
    page.waitForResponse(
      (candidate) =>
        candidate.url() === `${endpoint}/host-commands` &&
        candidate.request().method() === "POST" &&
        candidate.request().postDataJSON()?.command_name === "deleteGame",
      { timeout: 20_000 },
    ),
    page.getByRole("button", { name: "Delete game", exact: true }).click(),
  ]);
  assert.equal(response.status(), 200, "Game deletion must succeed");
  assert.equal((await response.json()).ok, true, "Game deletion was rejected");
  await page.waitForURL(`${location.origin}/`, { timeout: 20_000 });

  // A visible heading can predate deletion. Independently read the committed
  // server state before closing the context (which can cancel pending fetches).
  const resumed = await page
    .context()
    .request.get(endpoint, { timeout: 15_000 });
  assert.equal(resumed.status(), 410, "Deleted acceptance game still resumes");
  assert.equal((await resumed.json()).error, "game_deleted");
}
