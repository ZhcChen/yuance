import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createResourceManifest,
  validateResourceManifest,
} from "../src/protocol/resource-manifest.mjs";

async function withRendererFiles(files, callback) {
  const rootDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "yuance-renderer-manifest-"));
  try {
    for (const [relativePath, contents] of Object.entries(files)) {
      const filePath = path.join(rootDirectory, relativePath);
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, contents);
    }
    await callback(rootDirectory);
  } finally {
    await fs.rm(rootDirectory, { recursive: true, force: true });
  }
}

test("createResourceManifest records stable final bytes and paths", async () => {
  await withRendererFiles({ "index.html": "<main>Yuance</main>", "assets/app.js": "export {};" }, async (rootDirectory) => {
    const manifest = await createResourceManifest({ fs, rootDirectory });

    assert.equal(manifest.version, 1);
    assert.equal(manifest.entrypoint, "/index.html");
    assert.deepEqual(Object.keys(manifest.files), ["/assets/app.js", "/index.html"]);
    assert.equal(manifest.files["/index.html"].bytes, 19);
    assert.equal(
      manifest.files["/index.html"].sha256,
      crypto.createHash("sha256").update("<main>Yuance</main>").digest("hex"),
    );
    assert.equal(validateResourceManifest(manifest), manifest);
  });
});

test("createResourceManifest rejects a missing entrypoint", async () => {
  await withRendererFiles({ "assets/app.js": "export {};" }, async (rootDirectory) => {
    await assert.rejects(
      createResourceManifest({ fs, rootDirectory }),
      /Renderer entrypoint is missing/,
    );
  });
});

test("createResourceManifest rejects symbolic links", async (context) => {
  if (process.platform === "win32") {
    context.skip("Windows CI does not grant symlink creation privileges.");
    return;
  }
  await withRendererFiles({ "index.html": "ok" }, async (rootDirectory) => {
    await fs.symlink(path.join(rootDirectory, "index.html"), path.join(rootDirectory, "linked.html"));
    await assert.rejects(
      createResourceManifest({ fs, rootDirectory }),
      /cannot contain symbolic links/,
    );
  });
});

test("validateResourceManifest rejects traversal and malformed hashes", () => {
  assert.throws(
    () => validateResourceManifest({
      version: 1,
      entrypoint: "/index.html",
      files: {
        "/index.html": { relativePath: "../index.html", bytes: 1, sha256: "x".repeat(64) },
      },
    }),
    /entry is invalid/,
  );
});

test("validateResourceManifest binds every URL key to one relative path", () => {
  assert.throws(
    () => validateResourceManifest({
      version: 1,
      entrypoint: "/index.html",
      files: {
        "/index.html": { relativePath: "other.html", bytes: 1, sha256: "a".repeat(64) },
      },
    }),
    /entry is invalid/,
  );
});

test("validateResourceManifest rejects non-canonical cross-platform paths", () => {
  for (const relativePath of ["", "assets\\app.js", "assets/./app.js", "assets//app.js", "C:\\app.js"] ) {
    assert.throws(
      () => validateResourceManifest({
        version: 1,
        entrypoint: "/index.html",
        files: {
          "/index.html": { relativePath, bytes: 1, sha256: "a".repeat(64) },
        },
      }),
      /entry is invalid/,
      relativePath,
    );
  }
});

test("createResourceManifest rejects POSIX filenames containing backslashes", async (context) => {
  if (process.platform === "win32") {
    context.skip("Windows does not allow backslashes in a filename.");
    return;
  }
  await withRendererFiles({ "index.html": "ok", "assets\\app.js": "bad" }, async (rootDirectory) => {
    await assert.rejects(createResourceManifest({ fs, rootDirectory }), /Invalid renderer resource path/);
  });
});
