import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  planReleaseAssetUploads,
  signedUploadHeaders,
} from "../../scripts/publish-desktop-release.mjs";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(testDir, "..", "..");
const assetNames = [
  "Yuance-0.1.0-mac-x64.dmg",
  "Yuance-0.1.0-mac-arm64.dmg",
  "Yuance-0.1.0-win-x64.exe",
  "Yuance-0.1.0-win-arm64.exe",
  "Yuance-0.1.0-linux-x64.AppImage",
  "Yuance-0.1.0-linux-arm64.AppImage",
];

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

function json(response, status, body) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

function runPublication(environment) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["scripts/publish-desktop-release.mjs"], {
      cwd: repositoryRoot,
      env: { ...process.env, ...environment },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

test("preserves tuple-based signed headers and uses the local file length", () => {
  const headers = signedUploadHeaders(
    [
      ["x-yuance-signature", "signed-value"],
      ["content-length", "999"],
    ],
    { contentType: "application/octet-stream", byteSize: 42 },
  );
  assert.equal(headers.get("x-yuance-signature"), "signed-value");
  assert.equal(headers.get("content-length"), "42");
});

test("refuses an existing draft asset with the same target but a different file", () => {
  const asset = {
    key: "macos:arm64",
    platform: "macos",
    architecture: "arm64",
    canonicalName: "Yuance-0.1.0-mac-arm64.dmg",
    byteSize: 10,
  };
  assert.throws(
    () =>
      planReleaseAssetUploads([asset], {
        assets: [
          {
            platform: "macos",
            architecture: "arm64",
            filename: "Yuance-0.1.0-mac-arm64-old.dmg",
            byte_size: 10,
            status: "uploaded",
          },
        ],
      }),
    /does not match/,
  );
});

test("publishes six local desktop assets through the system OpenAPI", async (t) => {
  const state = {
    createRelease: null,
    createdAssets: [],
    uploadedAssetIds: [],
    uploadedBodies: new Map(),
    uploadedHeaders: new Map(),
    publishPayload: null,
  };
  let nextAssetId = 1;
  const server = createServer(async (request, response) => {
    const target = new URL(request.url || "/", "http://127.0.0.1");
    if (target.pathname.startsWith("/api/")) {
      assert.equal(request.headers.authorization, "Bearer test-system-token");
    }

    if (request.method === "GET" && target.pathname === "/api/v1/system/releases") {
      json(response, 200, {
        data: { items: [], pagination: { page: 1, per_page: 100, total_pages: 1 } },
      });
      return;
    }
    if (request.method === "POST" && target.pathname === "/api/v1/system/releases") {
      state.createRelease = JSON.parse((await readRequestBody(request)).toString("utf8"));
      json(response, 201, {
        data: {
          release: { id: 1, version_name: "0.1.0", status: "draft" },
          assets: [],
        },
      });
      return;
    }
    if (request.method === "POST" && target.pathname === "/api/v1/system/releases/1/assets") {
      const asset = JSON.parse((await readRequestBody(request)).toString("utf8"));
      asset.id = nextAssetId;
      state.createdAssets.push(asset);
      json(response, 201, { data: asset });
      nextAssetId += 1;
      return;
    }

    const uploadUrlMatch = target.pathname.match(/^\/api\/v1\/system\/releases\/1\/assets\/(\d+)\/upload-url$/);
    if (request.method === "GET" && uploadUrlMatch) {
      const assetId = uploadUrlMatch[1];
      json(response, 200, {
        data: {
          request: {
            method: "PUT",
            url: `http://127.0.0.1:${server.address().port}/uploads/${assetId}`,
            headers: [
              ["x-yuance-signature", "signed-value"],
              ["content-length", "999"],
            ],
          },
        },
      });
      return;
    }

    const uploadMatch = target.pathname.match(/^\/uploads\/(\d+)$/);
    if (request.method === "PUT" && uploadMatch) {
      state.uploadedBodies.set(Number(uploadMatch[1]), await readRequestBody(request));
      state.uploadedHeaders.set(Number(uploadMatch[1]), request.headers);
      response.writeHead(200);
      response.end();
      return;
    }

    const uploadedMatch = target.pathname.match(/^\/api\/v1\/system\/releases\/1\/assets\/(\d+)\/uploaded$/);
    if (request.method === "POST" && uploadedMatch) {
      state.uploadedAssetIds.push(Number(uploadedMatch[1]));
      json(response, 200, { data: { id: Number(uploadedMatch[1]), status: "uploaded" } });
      return;
    }
    if (request.method === "PATCH" && target.pathname === "/api/v1/system/releases/1") {
      state.publishPayload = JSON.parse((await readRequestBody(request)).toString("utf8"));
      json(response, 200, {
        data: { release: { id: 1, version_name: "0.1.0", status: "published" }, assets: [] },
      });
      return;
    }

    json(response, 404, { error: { message: `Unhandled ${request.method} ${target.pathname}` } });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());

  const assetDirectory = await mkdtemp(path.join(os.tmpdir(), "yuance-publish-test-"));
  t.after(() => rm(assetDirectory, { recursive: true, force: true }));
  await Promise.all(
    assetNames.map((name, index) => writeFile(path.join(assetDirectory, name), Buffer.from([index]))),
  );

  const result = await runPublication({
    YUANCE_DRY_RUN: "",
    YUANCE_RELEASE_NOTES_FILE: "",
    YUANCE_DESKTOP_VERSION: "0.1.0",
    YUANCE_DESKTOP_ASSET_DIR: assetDirectory,
    YUANCE_API_BASE_URL: `http://127.0.0.1:${server.address().port}`,
    YUANCE_SYSTEM_API_TOKEN: "test-system-token",
    YUANCE_RELEASE_TITLE: "元策桌面端 0.1.0",
    YUANCE_RELEASE_NOTES: "测试发布",
  });

  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /Published system release 0\.1\.0/);
  assert.deepEqual(state.createRelease, {
    version_name: "0.1.0",
    title: "元策桌面端 0.1.0",
    notes: "测试发布",
  });
  assert.equal(state.createdAssets.length, 6);
  assert.equal(
    state.createdAssets.find((asset) => asset.platform === "windows" && asset.architecture === "x64")
      ?.content_type,
    "application/x-msdownload",
  );
  assert.deepEqual(
    state.createdAssets.map((asset) => `${asset.platform}:${asset.architecture}`).sort(),
    ["linux:arm64", "linux:x64", "macos:arm64", "macos:x64", "windows:arm64", "windows:x64"],
  );
  assert.equal(state.uploadedBodies.size, 6);
  assert.equal(state.uploadedHeaders.get(1)["x-yuance-signature"], "signed-value");
  assert.equal(state.uploadedHeaders.get(1)["content-length"], "1");
  assert.deepEqual(state.uploadedAssetIds.sort((left, right) => left - right), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(state.publishPayload, {
    version_name: "0.1.0",
    title: "元策桌面端 0.1.0",
    notes: "测试发布",
    publish: true,
  });
});
