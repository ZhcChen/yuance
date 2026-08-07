import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createAppProtocolHandler,
  loadResourceManifest,
  registerAppProtocol,
  verifyManifestResources,
} from "../src/protocol/app-protocol-handler.mjs";

function manifestFor(contents) {
  return {
    version: 1,
    entrypoint: "/index.html",
    files: {
      "/index.html": {
        relativePath: "index.html",
        bytes: Buffer.byteLength(contents),
        sha256: crypto.createHash("sha256").update(contents).digest("hex"),
      },
    },
  };
}

async function withFixture(callback) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "yuance-app-handler-"));
  try {
    const contents = "<main>Yuance</main>";
    const manifest = manifestFor(contents);
    await fs.writeFile(path.join(root, "index.html"), contents);
    await fs.writeFile(path.join(root, "resource-manifest.json"), JSON.stringify(manifest));
    await callback({ root, contents, manifest });
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

test("serves only verified manifest bytes for GET and HEAD", async () => {
  await withFixture(async ({ root, contents, manifest }) => {
    const handler = createAppProtocolHandler({ fs, rendererRoot: root, manifest });
    const getResponse = await handler({ method: "GET", url: "app://yuance/" });
    const headResponse = await handler({ method: "HEAD", url: "app://yuance/" });
    assert.equal(getResponse.status, 200);
    assert.equal(await getResponse.text(), contents);
    assert.equal(getResponse.headers.get("content-security-policy")?.includes("connect-src 'none'"), true);
    assert.equal(headResponse.status, 200);
    assert.equal(await headResponse.text(), "");
  });
});

test("fails closed when a resource is missing or changed", async () => {
  await withFixture(async ({ root, manifest }) => {
    const handler = createAppProtocolHandler({ fs, rendererRoot: root, manifest });
    await fs.writeFile(path.join(root, "index.html"), "tampered");
    assert.equal((await handler({ method: "GET", url: "app://yuance/" })).status, 500);
    await fs.rm(path.join(root, "index.html"));
    assert.equal((await handler({ method: "GET", url: "app://yuance/" })).status, 500);
  });
});

test("delegates only the reserved dynamic preview path", async () => {
  await withFixture(async ({ root, manifest }) => {
    const calls = [];
    const handler = createAppProtocolHandler({ fs, rendererRoot: root, manifest, previewHandler: async (request) => { calls.push(request.url); return new Response("preview"); } });
    const capability = `ypv_${"a".repeat(32)}`;
    assert.equal(await (await handler({ method: "GET", url: `app://yuance/.preview/${capability}` })).text(), "preview");
    assert.equal((await handler({ method: "GET", url: "app://yuance/.preview-not-reserved" })).status, 404);
    assert.deepEqual(calls, [`app://yuance/.preview/${capability}`]);
  });
});

test("rejects runtime symbolic links even when bytes match the manifest", async (context) => {
  if (process.platform === "win32") {
    context.skip("Windows CI does not grant symlink creation privileges.");
    return;
  }
  await withFixture(async ({ root, manifest }) => {
    const handler = createAppProtocolHandler({ fs, rendererRoot: root, manifest });
    const target = path.join(root, "target.html");
    await fs.rename(path.join(root, "index.html"), target);
    await fs.symlink(target, path.join(root, "index.html"));
    assert.equal((await handler({ method: "GET", url: "app://yuance/" })).status, 500);
  });
});

test("loads and registers the manifest on the selected session protocol", async () => {
  await withFixture(async ({ root }) => {
    const registrations = [];
    const protocol = {
      async handle(scheme, handler) {
        registrations.push({ scheme, handler });
      },
    };
    const manifestPath = path.join(root, "resource-manifest.json");
    assert.equal((await loadResourceManifest({ fs, manifestPath })).entrypoint, "/index.html");
    await registerAppProtocol({ protocol, fs, rendererRoot: root, manifestPath });
    assert.equal(registrations.length, 1);
    assert.equal(registrations[0].scheme, "app");
    assert.equal((await registrations[0].handler({ method: "GET", url: "app://yuance/" })).status, 200);
  });
});

test("registration rejects any missing or modified manifest resource before window creation", async () => {
  await withFixture(async ({ root, manifest }) => {
    await fs.writeFile(path.join(root, "index.html"), "tampered");
    await assert.rejects(
      verifyManifestResources({ fs, rendererRoot: root, manifest }),
      /integrity check failed/,
    );
    await assert.rejects(
      registerAppProtocol({
        protocol: { handle: async () => assert.fail("must not register invalid resources") },
        fs,
        rendererRoot: root,
        manifestPath: path.join(root, "resource-manifest.json"),
      }),
      /integrity check failed/,
    );
  });
});
