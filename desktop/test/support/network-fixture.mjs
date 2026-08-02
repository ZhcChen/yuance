import fs from "node:fs/promises";
import http from "node:http";
import https from "node:https";

const enrollment = Object.freeze({
  schema_version: 1,
  api_protocol_version: 1,
  server_instance_id: "electron-network-test",
  capabilities: ["device-authorization.v1", "device-session.probe.v1"],
});

export async function startNetworkFixture() {
  const state = {
    targetRequests: 0,
    enrollmentRequests: 0,
    proxyRequests: 0,
    pacRequests: 0,
    cookieHeaders: [],
    authorizationHeaders: [],
    uploadBodies: [],
    uploadHeaders: [],
    downloadHeaders: [],
  };
  const target = http.createServer((request, response) => {
    state.targetRequests += 1;
    state.cookieHeaders.push(request.headers.cookie || "");
    state.authorizationHeaders.push(request.headers.authorization || "");
    if (request.url === "/auth-seed") {
      if (request.headers.authorization === `Basic ${Buffer.from("yuance-test:secret").toString("base64")}`) {
        response.end("authenticated");
      } else {
        response.writeHead(401, { "www-authenticate": "Basic realm=yuance-network-test" });
        response.end("authentication required");
      }
      return;
    }
    if (request.url === "/upload") {
      const chunks = [];
      request.on("data", (chunk) => chunks.push(chunk));
      request.on("end", () => {
        state.uploadBodies.push(Buffer.concat(chunks));
        state.uploadHeaders.push({ authorization: request.headers.authorization || "", cookie: request.headers.cookie || "", contentType: request.headers["content-type"] || "" });
        response.writeHead(204);
        response.end();
      });
      return;
    }
    if (request.url === "/download") {
      const content = Buffer.from("yuance-electron-download-canary");
      state.downloadHeaders.push({ authorization: request.headers.authorization || "", cookie: request.headers.cookie || "" });
      response.writeHead(200, {
        "content-type": "application/octet-stream",
        "content-length": String(content.length),
      });
      response.end(content);
      return;
    }
    state.enrollmentRequests += 1;
    sendEnrollment(response);
  });
  await listen(target);

  const redirect = http.createServer((_request, response) => {
    response.writeHead(302, { location: `${origin(target, "http")}/.well-known/yuance-desktop` });
    response.end();
  });
  await listen(redirect);

  const proxy = http.createServer((request, response) => {
    state.proxyRequests += 1;
    const targetUrl = new URL(request.url);
    const upstream = http.request(targetUrl, {
      method: request.method,
      headers: { ...request.headers, host: targetUrl.host },
    }, (upstreamResponse) => {
      response.writeHead(upstreamResponse.statusCode, upstreamResponse.headers);
      upstreamResponse.pipe(response);
    });
    upstream.on("error", () => {
      response.writeHead(502);
      response.end();
    });
    request.pipe(upstream);
  });
  await listen(proxy);

  const rejectingProxy = http.createServer((_request, response) => {
    response.writeHead(407, { "proxy-authenticate": "Basic realm=yuance-test" });
    response.end("proxy authentication required");
  });
  await listen(rejectingProxy);

  const pac = http.createServer((_request, response) => {
    state.pacRequests += 1;
    response.setHeader("content-type", "application/x-ns-proxy-autoconfig");
    response.end(`function FindProxyForURL(url, host) { return "PROXY 127.0.0.1:${proxy.address().port}"; }`);
  });
  await listen(pac);

  const [key, cert] = await Promise.all([
    fs.readFile(new URL("../fixtures/network/self-signed-key.pem", import.meta.url)),
    fs.readFile(new URL("../fixtures/network/self-signed-cert.pem", import.meta.url)),
  ]);
  const tls = https.createServer({ key, cert }, (_request, response) => sendEnrollment(response));
  await listen(tls);

  return {
    state,
    targetOrigin: origin(target, "http"),
    redirectOrigin: origin(redirect, "http"),
    tlsOrigin: origin(tls, "https"),
    proxyRules: `http=127.0.0.1:${proxy.address().port}`,
    rejectingProxyRules: `http=127.0.0.1:${rejectingProxy.address().port}`,
    pacUrl: `${origin(pac, "http")}/proxy.pac`,
    async close() {
      await Promise.all([target, redirect, proxy, rejectingProxy, pac, tls].map(close));
    },
  };
}

function sendEnrollment(response) {
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("cache-control", "no-store");
  response.setHeader("set-cookie", "server_cookie=secret; Path=/; HttpOnly; SameSite=Strict");
  response.end(JSON.stringify(enrollment));
}

function listen(server) {
  return new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
}

function close(server) {
  server.closeAllConnections?.();
  return new Promise((resolve) => server.close(resolve));
}

function origin(server, protocol) {
  return `${protocol}://127.0.0.1:${server.address().port}`;
}
