import assert from "node:assert/strict";
import test from "node:test";

import {
  canonicalizeServerOrigin,
  createDesktopProfile,
  createProfileKey,
} from "../src/auth/profile.mjs";

const productionProfile = {
  endpoint: "https://yuance.example",
  serverInstanceId: "srv_01JXYZ",
};

test("creates a stable production profile from a canonical HTTPS origin", () => {
  const first = createDesktopProfile(productionProfile);
  const second = createDesktopProfile({
    ...productionProfile,
    endpoint: "https://YUANCE.example:443/",
  });

  assert.deepEqual(first, second);
  assert.equal(first.origin, "https://yuance.example");
  assert.match(first.key, /^yuance-desktop-profile-v1:[a-f0-9]{64}$/);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(
    first.key,
    createProfileKey({
      origin: first.origin,
      serverInstanceId: first.serverInstanceId,
      mode: first.mode,
    }),
  );
});

test("rejects unsafe production endpoints", () => {
  const endpoints = [
    "http://yuance.example",
    "https://user@yuance.example",
    "https://user:secret@yuance.example",
    "https://yuance.example?tenant=1",
    "https://yuance.example#login",
    "https://yuance.example/web",
    "https://yuance.example//",
    "https://yuance.example/.",
    "https://yuance.example/%2e",
    "https:\\yuance.example",
    " https://yuance.example",
    "file:///tmp/yuance",
    "yuance.example",
  ];

  for (const endpoint of endpoints) {
    assert.throws(
      () => createDesktopProfile({ ...productionProfile, endpoint }),
      /Invalid desktop profile/,
      endpoint,
    );
  }
  assert.throws(
    () => createDesktopProfile({ ...productionProfile, redirected: true }),
    /redirected endpoints are not accepted/,
  );
});

test("allows HTTP only for explicitly enabled development loopback origins", () => {
  for (const endpoint of [
    "http://localhost:33033",
    "http://127.0.0.1:33033/",
    "http://127.42.10.9:33033",
    "http://[::1]:33033",
  ]) {
    const profile = createDesktopProfile({
      endpoint,
      serverInstanceId: "local-instance",
      mode: "development",
      allowLoopbackHttp: true,
    });
    assert.equal(profile.origin, canonicalizeServerOrigin(endpoint, {
      mode: "development",
      allowLoopbackHttp: true,
    }));
  }

  for (const options of [
    { endpoint: "http://localhost:33033", mode: "production", allowLoopbackHttp: true },
    { endpoint: "http://localhost:33033", mode: "development" },
    { endpoint: "http://192.168.1.2:33033", mode: "development", allowLoopbackHttp: true },
    { endpoint: "http://example.test:33033", mode: "development", allowLoopbackHttp: true },
  ]) {
    assert.throws(
      () => createDesktopProfile({ ...options, serverInstanceId: "local-instance" }),
      /must use HTTPS/,
    );
  }
});

test("requires an exact non-empty server instance identity", () => {
  for (const serverInstanceId of [undefined, null, "", " ", " server", "server ", "server\nname"]) {
    assert.throws(
      () => createDesktopProfile({
        endpoint: productionProfile.endpoint,
        serverInstanceId,
      }),
      /server_instance_id/,
    );
  }
});

test("does not reuse profile keys across endpoint, server identity, or runtime mode changes", () => {
  const profiles = [
    createDesktopProfile(productionProfile),
    createDesktopProfile({ ...productionProfile, endpoint: "https://other.example" }),
    createDesktopProfile({ ...productionProfile, serverInstanceId: "srv_rebuilt" }),
    createDesktopProfile({ ...productionProfile, mode: "development" }),
  ];

  assert.equal(new Set(profiles.map(({ key }) => key)).size, profiles.length);
});
