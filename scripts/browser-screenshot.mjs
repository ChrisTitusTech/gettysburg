const activeScreenshots = new WeakSet();
const webkitStyleProbe =
  "Refused to apply a stylesheet because its hash, its nonce, or 'unsafe-inline' does not appear in the style-src directive of the Content Security Policy.";

// Playwright 1.62.1's WebKit screenshot preparation inserts an empty "body {}"
// stylesheet to synchronize animations. Our unchanged production CSP rejects
// it. Classify only that known diagnostic while screenshot preparation runs;
// application errors and the same CSP message outside capture still fail.
export function isScreenshotDiagnostic(page, message) {
  return (
    activeScreenshots.has(page) &&
    page.context().browser()?.browserType().name() === "webkit" &&
    message.type() === "error" &&
    message.text() === webkitStyleProbe
  );
}

export async function captureScreenshot(page, target, options) {
  activeScreenshots.add(page);
  try {
    return await target.screenshot(options);
  } finally {
    activeScreenshots.delete(page);
  }
}
