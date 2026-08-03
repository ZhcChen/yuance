import assert from "node:assert/strict";
import asar from "@electron/asar";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { createResourceManifest } from "../src/protocol/resource-manifest.mjs";
import { verifyAppBundle } from "../scripts/verify-app-bundle.mjs";

const execFileAsync = promisify(execFile);

async function waitForArchiveFixture(archive) {
  let lastError;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      const manifestEntry = asar.listPackage(archive).find(
        (entry) => entry.replace(/^[/\\]+/u, "").replaceAll("\\", "/") === "renderer-dist/resource-manifest.json",
      );
      if (!manifestEntry) throw new Error("Fixture manifest is missing from ASAR.");
      JSON.parse(
        asar.extractFile(archive, manifestEntry.replace(/^[/\\]+/u, ""), false).toString("utf8"),
      );
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  throw lastError;
}

async function createBundleFixture({
  extraRendererFiles = {},
  protocolHandlerSource,
  rendererAppSource,
  mutateManifest,
  protocolSource,
  registeredRendererFiles = {},
} = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "yuance-app-bundle-"));
  const source = path.join(root, "source");
  const renderer = path.join(source, "renderer-dist");
  await fs.mkdir(path.join(source, "src", "protocol"), { recursive: true });
  await fs.mkdir(path.join(source, "src", "ipc"), { recursive: true });
  await fs.mkdir(path.join(source, "src", "network"), { recursive: true });
  await fs.mkdir(path.join(renderer, "assets"), { recursive: true });
  await fs.writeFile(path.join(source, "src", "main.mjs"), "export {};\n");
  await fs.writeFile(path.join(source, "src", "preload.cjs"), "module.exports = {};\n");
  await fs.writeFile(path.join(source, "src", "ipc", "business-commands.mjs"), "export {};\n");
  await fs.writeFile(path.join(source, "src", "network", "operation-registry.mjs"), "export {};\n");
  await fs.writeFile(path.join(source, "src", "network", "rest-transport.mjs"), "export {};\n");
  await fs.writeFile(
    path.join(source, "src", "protocol", "app-protocol.mjs"),
    protocolSource ?? await fs.readFile(new URL("../src/protocol/app-protocol.mjs", import.meta.url), "utf8"),
  );
  await fs.writeFile(
    path.join(source, "src", "protocol", "app-protocol-handler.mjs"),
    protocolHandlerSource ?? await fs.readFile(
      new URL("../src/protocol/app-protocol-handler.mjs", import.meta.url),
      "utf8",
    ),
  );
  await fs.writeFile(path.join(renderer, "index.html"), "<script src=\"/assets/app.js\"></script>");
  await fs.writeFile(path.join(renderer, "assets", "app.js"), rendererAppSource ?? [
    "const adapter = 'Desktop business request failed.';",
    "const labels = ['元策浏览器工作台', '消息中心', '项目列表'];",
    "const __CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE=true;",
    "export { adapter, labels, __CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE };",
  ].join("\n"));
  for (const [relativePath, contents] of Object.entries(registeredRendererFiles)) {
    const filePath = path.join(renderer, relativePath);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, contents);
  }
  const manifest = await createResourceManifest({ fs, rootDirectory: renderer });
  const outputManifest = mutateManifest ? mutateManifest(structuredClone(manifest)) : manifest;
  await fs.writeFile(path.join(renderer, "resource-manifest.json"), JSON.stringify(outputManifest));
  for (const [relativePath, contents] of Object.entries(extraRendererFiles)) {
    const filePath = path.join(renderer, relativePath);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, contents);
  }
  if (process.platform === "win32") {
    const nativeName = Object.freeze({
      x64: "index.win32-x64-msvc.node",
      arm64: "index.win32-arm64-msvc.node",
    })[process.arch];
    assert.ok(nativeName, "Windows bundle fixture requires a supported architecture");
    const nativeDirectory = path.join(source, "src", "native");
    await fs.mkdir(nativeDirectory, { recursive: true });
    await fs.copyFile(new URL(`../src/native/${nativeName}`, import.meta.url), path.join(nativeDirectory, nativeName));
  }
  const archive = path.join(root, "app.asar");
  if (process.platform === "win32") {
    await asar.createPackageWithOptions(source, archive, { unpack: "**/*.node" });
  } else {
    await asar.createPackage(source, archive);
  }
  await waitForArchiveFixture(archive);
  return { archive, root };
}

test("verifies renderer bytes, required host files, and CSP in the actual ASAR", async (context) => {
  const fixture = await createBundleFixture();
  context.after(() => fs.rm(fixture.root, { recursive: true, force: true }));
  if (process.platform === "win32") {
    await execFileAsync(process.execPath, [fileURLToPath(new URL("../scripts/verify-app-bundle.mjs", import.meta.url)), fixture.archive]);
  } else {
    const result = await verifyAppBundle(fixture.archive);
    assert.equal(result.resourceCount, 2);
    assert.equal(result.archive, fixture.archive);
  }
});

test("rejects manifest integrity mismatch from the actual ASAR", async (context) => {
  const fixture = await createBundleFixture({
    mutateManifest(manifest) {
      manifest.files["/assets/app.js"].sha256 = "0".repeat(64);
      return manifest;
    },
  });
  context.after(() => fs.rm(fixture.root, { recursive: true, force: true }));
  await assert.rejects(verifyAppBundle(fixture.archive), /integrity mismatch/);
});

test("rejects unregistered renderer files and CSP drift", async (context) => {
  const extra = await createBundleFixture({ extraRendererFiles: { "unexpected.js": "export {};" } });
  context.after(() => fs.rm(extra.root, { recursive: true, force: true }));
  await assert.rejects(verifyAppBundle(extra.archive), /Unregistered renderer file/);

  const weakCsp = await createBundleFixture({ protocolSource: "export const value = 'unsafe-inline';\n" });
  context.after(() => fs.rm(weakCsp.root, { recursive: true, force: true }));
  await assert.rejects(verifyAppBundle(weakCsp.archive), /CSP declaration|weakens/);
});

test("rejects a CSP declaration disconnected from the protocol response", async (context) => {
  const source = await fs.readFile(new URL("../src/protocol/app-protocol.mjs", import.meta.url), "utf8");
  const fixture = await createBundleFixture({
    protocolSource: source.replace(
      '"Content-Security-Policy": APP_CONTENT_SECURITY_POLICY,',
      '"Content-Security-Policy": "default-src *",',
    ),
  });
  context.after(() => fs.rm(fixture.root, { recursive: true, force: true }));
  await assert.rejects(verifyAppBundle(fixture.archive), /does not bind/);
});

test("rejects a protocol handler that drops verified response headers", async (context) => {
  const source = await fs.readFile(
    new URL("../src/protocol/app-protocol-handler.mjs", import.meta.url),
    "utf8",
  );
  const fixture = await createBundleFixture({
    protocolHandlerSource: source.replace("headers: resolution.headers,", "headers: {},"),
  });
  context.after(() => fs.rm(fixture.root, { recursive: true, force: true }));
  await assert.rejects(verifyAppBundle(fixture.archive), /does not forward/);
});

test("rejects registered source maps and development runtime references", async (context) => {
  const sourceMap = await createBundleFixture({ registeredRendererFiles: { "assets/app.js.map": "{}" } });
  context.after(() => fs.rm(sourceMap.root, { recursive: true, force: true }));
  await assert.rejects(verifyAppBundle(sourceMap.archive), /Forbidden renderer artifact/);

  const devUrl = await createBundleFixture({
    registeredRendererFiles: { "assets/dev.js": "fetch('http://127.0.0.1:4273')" },
  });
  context.after(() => fs.rm(devUrl.root, { recursive: true, force: true }));
  await assert.rejects(verifyAppBundle(devUrl.archive), /development runtime reference/);
});

test("rejects renderer file capabilities, signed requests, and local path fixtures", async (context) => {
  for (const source of [
    "import fs from 'node:fs';",
    "window.ipcRenderer.invoke('open')",
    "const signed_url = 'secret';",
    "const fixture = '/Users/private/file.txt';",
  ]) {
    const fixture = await createBundleFixture({ registeredRendererFiles: { "assets/private.js": source } });
    context.after(() => fs.rm(fixture.root, { recursive: true, force: true }));
    await assert.rejects(verifyAppBundle(fixture.archive), /Renderer resource contains/);
  }
});

test("requires the shared business app and exactly one React runtime", async (context) => {
  const missingApp = await createBundleFixture({ rendererAppSource: "const __CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE=true;" });
  context.after(() => fs.rm(missingApp.root, { recursive: true, force: true }));
  await assert.rejects(verifyAppBundle(missingApp.archive), /missing the shared business application/);

  const duplicateReact = await createBundleFixture({
    registeredRendererFiles: { "assets/duplicate.js": "const __CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE=true;" },
  });
  context.after(() => fs.rm(duplicateReact.root, { recursive: true, force: true }));
  await assert.rejects(verifyAppBundle(duplicateReact.archive), /exactly one React runtime/);
});
