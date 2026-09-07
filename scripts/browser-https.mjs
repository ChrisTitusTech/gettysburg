import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmod, mkdtemp, readFile, rm } from "node:fs/promises";
import { request } from "node:http";
import { createServer } from "node:https";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Task-owned loopback TLS termination exercises production Secure cookies.
// Never use this self-signed fixture or its browser certificate exception with
// an externally configured acceptance origin. Production TLS stays in Caddy.
export async function startBrowserHttps(backendOrigin) {
  const backend = new URL(backendOrigin);
  assert.equal(backend.protocol, "http:");
  assert.equal(backend.hostname, "127.0.0.1");
  const directory = await mkdtemp(join(tmpdir(), "gettysburg-browser-tls-"));
  const sockets = new Set();
  let server;
  async function close() {
    for (const socket of sockets) socket.destroy();
    if (server?.listening)
      await new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    await rm(directory, { recursive: true, force: true });
  }
  function track(socket) {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
    return socket;
  }
  try {
    const keyFile = join(directory, "key.pem");
    const certFile = join(directory, "cert.pem");
    execFileSync(
      "openssl",
      [
        "req",
        "-x509",
        "-newkey",
        "rsa:2048",
        "-nodes",
        "-days",
        "1",
        "-subj",
        "/CN=127.0.0.1",
        "-addext",
        "subjectAltName=IP:127.0.0.1",
        "-keyout",
        keyFile,
        "-out",
        certFile,
      ],
      { stdio: "ignore", timeout: 30_000 },
    );
    await chmod(keyFile, 0o600);
    const certificate = await readFile(certFile);
    server = createServer(
      { key: await readFile(keyFile), cert: certificate },
      (incoming, outgoing) => {
        const upstream = request(
          {
            hostname: backend.hostname,
            port: backend.port,
            path: incoming.url,
            method: incoming.method,
            headers: incoming.headers,
          },
          (response) => {
            outgoing.writeHead(response.statusCode, response.headers);
            response.pipe(outgoing);
            response.on("error", () => outgoing.destroy());
          },
        );
        upstream.setTimeout(30_000, () => upstream.destroy());
        upstream.on("error", () => outgoing.destroy());
        outgoing.on("close", () => upstream.destroy());
        incoming.on("aborted", () => upstream.destroy());
        incoming.pipe(upstream);
      },
    );
    server.on("connection", track);
    server.on("upgrade", (incoming, socket, head) => {
      const upstream = track(connect(Number(backend.port), backend.hostname));
      upstream.once("connect", () => {
        upstream.write(
          `${incoming.method} ${incoming.url} HTTP/${incoming.httpVersion}\r\n`,
        );
        for (let i = 0; i < incoming.rawHeaders.length; i += 2)
          upstream.write(
            `${incoming.rawHeaders[i]}: ${incoming.rawHeaders[i + 1]}\r\n`,
          );
        upstream.write("\r\n");
        if (head.length) upstream.write(head);
        socket.pipe(upstream).pipe(socket);
      });
      socket.on("error", () => upstream.destroy());
      socket.on("close", () => upstream.destroy());
      upstream.on("error", () => socket.destroy());
      upstream.on("close", () => socket.destroy());
    });
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    return {
      origin: `https://127.0.0.1:${server.address().port}`,
      certificate,
      contextOptions: { ignoreHTTPSErrors: true },
      close,
    };
  } catch (error) {
    await close();
    throw error;
  }
}
