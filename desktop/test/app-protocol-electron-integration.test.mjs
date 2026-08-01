import assert from "node:assert/strict";
import test from "node:test";

import { assertAppProtocolSmokeReport } from "../scripts/smoke-app-protocol.mjs";

function validReport() {
  const renderer = {
    url: "app://yuance/projects/smoke",
    title: "元策",
    bodyText: "需要登录",
    bridgeSchemaVersion: 2,
    bridgeState: "unauthenticated",
    resourceUrls: [
      "app://yuance/assets/index-aaaaaaaa.js",
      "app://yuance/assets/index-bbbbbbbb.css",
    ],
    subframeBridgeExposed: false,
    invalidPayloadRejected: true,
    permissionResult: "denied",
    networkProbeRejected: true,
    windowOpenDenied: true,
  };
  return {
    kind: "yuance-app-protocol-smoke",
    url: renderer.url,
    hostState: "unauthenticated",
    externalRequestCount: 0,
    csp: "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'none'; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    initialRenderer: { ...renderer, url: "app://yuance/" },
    reloadedRenderer: renderer,
    navigationDenied: true,
    permissionCheckCount: 1,
    subframeObserved: true,
    subframeIpcRejected: true,
    protocolStatuses: { missing: 404, traversal: 400, wrongHost: 403 },
    resourceResponses: renderer.resourceUrls,
    runtime: {
      isPackaged: true,
      rendererKind: "app-protocol",
      partition: "persist:yuance",
      isolatedProfile: true,
    },
  };
}

test("accepts the complete real Electron app protocol smoke contract", () => {
  const report = validReport();
  assert.equal(assertAppProtocolSmokeReport(report), report);
});

test("rejects protocol, renderer, IPC, permission, profile, and network regressions", () => {
  const mutations = [
    (value) => { value.externalRequestCount = 1; },
    (value) => { value.csp = "default-src *"; },
    (value) => { value.reloadedRenderer.url = "https://example.com/"; },
    (value) => { value.resourceResponses = []; },
    (value) => { value.resourceResponses = value.resourceResponses.map((url) => url.replace(/\.css$/u, ".js")); },
    (value) => { value.resourceResponses = value.resourceResponses.map((url) => url.replace(/\.js$/u, ".css")); },
    (value) => { value.reloadedRenderer.subframeBridgeExposed = true; },
    (value) => { value.reloadedRenderer.invalidPayloadRejected = false; },
    (value) => { value.reloadedRenderer.permissionResult = "timeout"; },
    (value) => { value.reloadedRenderer.networkProbeRejected = false; },
    (value) => { value.reloadedRenderer.windowOpenDenied = false; },
    (value) => { value.navigationDenied = false; },
    (value) => { value.permissionCheckCount = 0; },
    (value) => { value.subframeObserved = false; },
    (value) => { value.subframeIpcRejected = false; },
    (value) => { value.protocolStatuses.traversal = 200; },
    (value) => { value.runtime.rendererKind = "dev-server"; },
    (value) => { value.runtime.partition = "persist:yuance-dev"; },
    (value) => { value.runtime.isolatedProfile = false; },
    (value) => { value.reloadedRenderer.title = ""; },
    (value) => { value.reloadedRenderer.bodyText = ""; },
    (value) => { value.reloadedRenderer.bodyText = "Bearer secret"; },
  ];
  for (const mutate of mutations) {
    const report = validReport();
    mutate(report);
    assert.throws(() => assertAppProtocolSmokeReport(report), /smoke invariant failed/);
  }
});
