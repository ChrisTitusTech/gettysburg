import assert from "node:assert/strict";
import test from "node:test";
import {
  captureScreenshot,
  isScreenshotDiagnostic,
} from "./browser-screenshot.mjs";

test("only WebKit's known screenshot CSP probe is classified during capture", async () => {
  let engine = "webkit";
  const page = {
    context: () => ({
      browser: () => ({ browserType: () => ({ name: () => engine }) }),
    }),
  };
  const message = {
    type: () => "error",
    text: () =>
      "Refused to apply a stylesheet because its hash, its nonce, or 'unsafe-inline' does not appear in the style-src directive of the Content Security Policy.",
  };
  assert.equal(isScreenshotDiagnostic(page, message), false);
  await assert.rejects(
    captureScreenshot(
      page,
      {
        screenshot: async () => {
          assert.equal(isScreenshotDiagnostic(page, message), true);
          assert.equal(
            isScreenshotDiagnostic(page, {
              ...message,
              text: () => "Application error",
            }),
            false,
          );
          assert.equal(
            isScreenshotDiagnostic(page, { ...message, type: () => "warning" }),
            false,
          );
          engine = "chromium";
          assert.equal(isScreenshotDiagnostic(page, message), false);
          engine = "webkit";
          throw new Error("Failed screenshot");
        },
      },
      {},
    ),
    /Failed screenshot/,
  );
  assert.equal(isScreenshotDiagnostic(page, message), false);
});
