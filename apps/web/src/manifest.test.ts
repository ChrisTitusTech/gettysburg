// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Home Screen app metadata", () => {
  it("uses a stable credential-free identity and standalone root launch", () => {
    const manifest = JSON.parse(
      readFileSync(
        new URL("../public/manifest.webmanifest", import.meta.url),
        "utf8",
      ),
    );
    expect(manifest).toMatchObject({
      id: "/",
      name: "Gettysburg",
      short_name: "Gettysburg",
      start_url: "/",
      scope: "/",
      display: "standalone",
      theme_color: "#182219",
    });
    expect(manifest).not.toHaveProperty("icons");
    const html = readFileSync(
      new URL("../index.html", import.meta.url),
      "utf8",
    );
    expect(html).toContain(
      '<link rel="manifest" href="/manifest.webmanifest" />',
    );
  });
});
