import assert from "node:assert/strict";
import { createServer } from "node:http";
import { request } from "node:https";
import test from "node:test";
import { startBrowserHttps } from "./browser-https.mjs";

test("HTTPS fixture refuses non-loopback upstreams", async () => {
  await assert.rejects(startBrowserHttps("https://127.0.0.1:8000"));
  await assert.rejects(startBrowserHttps("http://example.com:8000"));
});

test(
  "HTTPS fixture preserves protected HTTP and WebSocket upgrade traffic",
  { timeout: 15_000 },
  async () => {
    const backend = createServer((incoming, outgoing) => {
      assert.equal(incoming.headers.origin, origin);
      assert.equal(incoming.headers.cookie, "fixture=session");
      assert.equal(incoming.url, "/protected?version=1");
      outgoing.writeHead(201, {
        "set-cookie":
          "__Host-fixture=value; Secure; HttpOnly; SameSite=Strict; Path=/",
        "content-security-policy": "default-src 'self'",
      });
      incoming.pipe(outgoing);
    });
    backend.on("upgrade", (incoming, socket, head) => {
      assert.equal(incoming.headers.origin, origin);
      assert.equal(incoming.headers.cookie, "fixture=session");
      socket.write(
        "HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: fixture\r\n\r\n",
      );
      if (head.length) socket.write(head);
      socket.pipe(socket);
    });
    await new Promise((resolve) => backend.listen(0, "127.0.0.1", resolve));
    let fixture;
    let origin;
    try {
      fixture = await startBrowserHttps(
        `http://127.0.0.1:${backend.address().port}`,
      );
      origin = fixture.origin;
      const headers = { origin, cookie: "fixture=session" };
      await new Promise((resolve, reject) => {
        const outgoing = request(
          `${origin}/protected?version=1`,
          {
            ca: fixture.certificate,
            method: "POST",
            headers,
          },
          (response) => {
            assert.equal(response.statusCode, 201);
            assert.equal(
              response.headers["set-cookie"][0],
              "__Host-fixture=value; Secure; HttpOnly; SameSite=Strict; Path=/",
            );
            assert.equal(
              response.headers["content-security-policy"],
              "default-src 'self'",
            );
            let body = "";
            response.on("data", (chunk) => {
              body += chunk;
            });
            response.on("end", () => {
              assert.equal(body, "fixture body");
              resolve();
            });
            response.on("error", reject);
          },
        );
        outgoing.on("error", reject);
        outgoing.end("fixture body");
      });
      await new Promise((resolve, reject) => {
        const outgoing = request(`${origin}/socket`, {
          ca: fixture.certificate,
          headers: { ...headers, connection: "Upgrade", upgrade: "fixture" },
        });
        outgoing.on("error", reject);
        outgoing.on("upgrade", (response, socket) => {
          assert.equal(response.statusCode, 101);
          socket.on("error", reject);
          socket.once("data", (chunk) => {
            assert.equal(chunk.toString(), "upgraded traffic");
            socket.destroy();
            resolve();
          });
          socket.write("upgraded traffic");
        });
        outgoing.end();
      });
      await fixture.close();
      await assert.rejects(
        new Promise((resolve, reject) => {
          const outgoing = request(
            origin,
            { ca: fixture.certificate },
            resolve,
          );
          outgoing.on("error", reject);
          outgoing.end();
        }),
      );
    } finally {
      await fixture?.close();
      await new Promise((resolve) => backend.close(resolve));
    }
  },
);
