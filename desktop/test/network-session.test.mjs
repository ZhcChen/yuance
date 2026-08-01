import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  createTrustedNetworkSession,
  isTrustedSessionFetch,
  networkPartitionForMode,
} from "../src/network/network-session.mjs";

test("creates isolated persistent sessions and clears ambient network state", async () => {
  const production = fakeElectronSession();
  const development = fakeElectronSession();

  const productionNetwork = await createTrustedNetworkSession({
    electronSession: production.module,
    mode: "production",
    allowedOrigin: "https://yuance.example",
  });
  const developmentNetwork = await createTrustedNetworkSession({
    electronSession: development.module,
    mode: "development",
    allowedOrigin: "http://127.0.0.1:33033",
  });

  assert.equal(production.partition, "persist:yuance-network-production-v1");
  assert.equal(development.partition, "persist:yuance-network-development-v1");
  assert.notEqual(production.partition, development.partition);
  assert.deepEqual(production.options, { cache: false });
  assert.deepEqual(development.options, { cache: false });
  assert.deepEqual(production.calls, [
    ["clearStorageData", { storages: ["cookies"] }],
    ["clearCache"],
    ["clearAuthCache"],
  ]);
  assert.equal(typeof productionNetwork.fetch, "function");
  assert.equal(isTrustedSessionFetch(productionNetwork.fetch), true);
  assert.equal(isTrustedSessionFetch(async () => {}), false);
  assert.equal(Object.isFrozen(productionNetwork), true);
  assert.equal(productionNetwork.partition, production.partition);
  assert.equal(networkPartitionForMode("production"), production.partition);
});

test("binds Chromium session.fetch and emits only redacted test observations", async () => {
  const fake = fakeElectronSession();
  const observations = [];
  const network = await createTrustedNetworkSession({
    electronSession: fake.module,
    mode: "production",
    allowedOrigin: "https://yuance.example",
    testObserver: (observation) => observations.push(observation),
  });

  const response = await network.fetch(
    "https://yuance.example/.well-known/yuance-desktop",
    {
      method: "GET",
      redirect: "manual",
      credentials: "omit",
      cache: "no-store",
      headers: { Authorization: "Bearer secret" },
    },
  );

  assert.equal(response.status, 200);
  assert.equal(fake.fetchCalls.length, 1);
  assert.deepEqual(observations, [{
    method: "GET",
    path: "/.well-known/yuance-desktop",
    status: 200,
  }]);
  assert.equal(JSON.stringify(observations).includes("secret"), false);
  assert.equal(fake.calls.some(([name]) => name === "setProxy"), false);
  assert.equal(fake.calls.some(([name]) => name === "setCertificateVerifyProc"), false);
});

test("rejects origin drift, ambient credentials, redirects, caching, and forbidden headers", async () => {
  const fake = fakeElectronSession();
  const network = await createTrustedNetworkSession({
    electronSession: fake.module,
    mode: "production",
    allowedOrigin: "https://yuance.example",
  });
  const safe = {
    redirect: "manual",
    credentials: "omit",
    cache: "no-store",
    headers: { Accept: "application/json" },
  };
  for (const [url, options] of [
    ["https://attacker.example/path", safe],
    ["not-a-url?secret=value", safe],
    ["https://yuance.example/path", { ...safe, redirect: "follow" }],
    ["https://yuance.example/path", { ...safe, credentials: "include" }],
    ["https://yuance.example/path", { ...safe, cache: "default" }],
    ["https://yuance.example/path", { ...safe, headers: { Cookie: "secret" } }],
    ["https://yuance.example/path", { ...safe, headers: { Origin: "https://attacker.example" } }],
    ["https://yuance.example/path", { ...safe, headers: { Referer: "https://attacker.example" } }],
  ]) {
    await assert.rejects(network.fetch(url, options), /trusted network request/);
  }
  assert.equal(fake.fetchCalls.length, 0);
});

test("fails closed when Chromium session primitives are unavailable", async () => {
  await assert.rejects(
    createTrustedNetworkSession({
      electronSession: {},
      mode: "production",
      allowedOrigin: "https://yuance.example",
    }),
    /fromPartition/,
  );
  await assert.rejects(
    createTrustedNetworkSession({
      electronSession: {
        fromPartition: () => ({
          clearStorageData: async () => {},
          clearCache: async () => {},
          clearAuthCache: async () => {},
        }),
      },
      mode: "production",
      allowedOrigin: "https://yuance.example",
    }),
    /session\.fetch/,
  );
  assert.throws(() => networkPartitionForMode("staging"), /mode/);
});

test("production network modules do not override proxy or certificate trust", async () => {
  const sources = await Promise.all([
    readFile(new URL("../src/network/network-session.mjs", import.meta.url), "utf8"),
    readFile(new URL("../src/network/enrollment-client.mjs", import.meta.url), "utf8"),
  ]);
  const source = sources.join("\n");
  assert.doesNotMatch(source, /setProxy|setCertificateVerifyProc|certificate-error/u);
  assert.doesNotMatch(source, /globalThis\.fetch/u);
});

function fakeElectronSession() {
  const calls = [];
  const fetchCalls = [];
  const value = {
    async clearStorageData(options) { calls.push(["clearStorageData", options]); },
    async clearCache() { calls.push(["clearCache"]); },
    async clearAuthCache() { calls.push(["clearAuthCache"]); },
    async fetch(url, options) {
      fetchCalls.push([url, options]);
      return new Response("{}", { headers: { "content-type": "application/json" } });
    },
  };
  const result = {
    calls,
    fetchCalls,
    module: {
      fromPartition(partition, options) {
        result.partition = partition;
        result.options = options;
        return value;
      },
    },
  };
  return result;
}
