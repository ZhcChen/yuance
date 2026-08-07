import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createPreviewProtocolHandler } from "../src/protocol/preview-protocol-handler.mjs";

test("serves exact preview capabilities with GET HEAD and byte ranges", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "yuance-preview-protocol-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const privatePath = path.join(root, "preview.bin");
  await fs.writeFile(privatePath, "0123456789");
  const capability = `ypv_${"a".repeat(32)}`;
  const handler = createPreviewProtocolHandler({ resolveSnapshot: async (value) => { assert.equal(value, capability); return { privatePath, contentType: "video/mp4", byteSize: 10 }; } });
  const full = await handler({ method: "GET", url: `app://yuance/.preview/${capability}` });
  assert.equal(full.status, 200);
  assert.equal(await full.text(), "0123456789");
  const ranged = await handler({ method: "GET", url: `app://yuance/.preview/${capability}`, headers: { range: "bytes=2-5" } });
  assert.equal(ranged.status, 206);
  assert.equal(ranged.headers.get("content-range"), "bytes 2-5/10");
  assert.equal(await ranged.text(), "2345");
  const head = await handler({ method: "HEAD", url: `app://yuance/.preview/${capability}` });
  assert.equal(head.status, 200);
  assert.equal(head.headers.get("content-length"), "10");
  assert.equal(await head.text(), "");
});

test("rejects unknown paths methods invalid ranges and unresolved capabilities", async () => {
  const capability = `ypv_${"b".repeat(32)}`;
  const handler = createPreviewProtocolHandler({ resolveSnapshot: async () => { throw new Error("expired"); } });
  assert.equal((await handler({ method: "POST", url: `app://yuance/.preview/${capability}` })).status, 405);
  assert.equal((await handler({ method: "GET", url: "app://yuance/.preview/not-a-capability" })).status, 404);
  assert.equal((await handler({ method: "GET", url: `app://yuance/.preview/${capability}` })).status, 404);
  const rangeHandler = createPreviewProtocolHandler({ resolveSnapshot: async () => ({ privatePath: "/unused", contentType: "text/plain", byteSize: 10 }) });
  const invalid = await rangeHandler({ method: "GET", url: `app://yuance/.preview/${capability}`, headers: { range: "bytes=1-2,4-5" } });
  assert.equal(invalid.status, 416);
  assert.equal(invalid.headers.get("content-range"), "bytes */10");
});
