import assert from "node:assert/strict";

// Checks served metadata, not an OS install or real push-provider enrollment.
export async function checkHomeScreen(browser, origin, contextOptions = {}) {
  const context = await browser.newContext(contextOptions);
  try {
    const page = await context.newPage();
    await page.goto(origin);
    assert.equal(
      await page.locator('link[rel="manifest"]').getAttribute("href"),
      "/manifest.webmanifest",
    );
    const response = await context.request.get(
      `${origin}/manifest.webmanifest`,
    );
    assert.equal(response.status(), 200);
    assert.match(
      response.headers()["content-type"],
      /application\/manifest\+json/,
    );
    const manifest = await response.json();
    assert.equal(manifest.id, "/");
    assert.equal(manifest.start_url, "/");
    assert.equal(manifest.scope, "/");
    assert.equal(manifest.display, "standalone");
    assert.equal(
      await page.evaluate(
        async () => (await navigator.serviceWorker.getRegistrations()).length,
      ),
      0,
      "Loading installation metadata must not register a service worker",
    );
    console.log(
      "Home Screen metadata passed; OS installation/provider checks remain manual",
    );
  } finally {
    await context.close();
  }
}
