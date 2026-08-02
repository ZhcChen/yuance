import assert from "node:assert/strict";
import test from "node:test";

import { FILE_CHANNELS, registerFileCommandHandlers } from "../src/ipc/file-commands.mjs";

function fixture() {
  const handlers = new Map();
  const calls = [];
  const event = { sender: { id: 7 }, senderFrame: { routingId: 11 } };
  const dispose = registerFileCommandHandlers({
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler), removeHandler: (channel) => handlers.delete(channel) },
    assertSender: (actual) => { calls.push(["sender", actual]); if (actual !== event) throw new Error("untrusted secret"); },
    getBinding: (_event, purpose) => ({ profileEpoch: 1, authorizationVersion: 2, webContentsId: 7, frameRoutingId: 11, purpose }),
    getWindow: () => ({ id: "window" }),
    fileDialog: { choose: async (input) => { calls.push(["choose", input]); return { capability: `yfc_${"a".repeat(32)}`, filename: "canary.txt", contentType: "text/plain", byteSize: 34, privatePath: "/secret" }; } },
    issueTransferGrant: async (purpose, binding) => { calls.push(["grant", purpose, binding]); return `ytg_${purpose}`; },
    uploadExecutor: { execute: async (input) => { calls.push(["upload", input]); return { status: "completed", byteSize: 34, url: "https://secret" }; } },
    downloadExecutor: { execute: async (input) => { calls.push(["download", input]); return { status: "completed", byteSize: 34, filename: "canary.txt", path: "/secret" }; } },
  });
  return { handlers, calls, event, dispose };
}

test("file commands bind fixed intents and return only public fields", async () => {
  const value = fixture();
  const capability = `yfc_${"a".repeat(32)}`;
  assert.deepEqual(await value.handlers.get(FILE_CHANNELS.choose)(value.event), { capability, filename: "canary.txt", contentType: "text/plain", byteSize: 34 });
  assert.deepEqual(await value.handlers.get(FILE_CHANNELS.uploadCanary)(value.event, capability), { status: "completed", byteSize: 34 });
  assert.deepEqual(await value.handlers.get(FILE_CHANNELS.downloadCanary)(value.event), { status: "completed", byteSize: 34, filename: "canary.txt" });
  assert.equal(JSON.stringify(value.calls).includes("/secret"), false);
  assert.equal(JSON.stringify(value.calls.filter(([name]) => name === "grant")).includes("authorizationVersion"), true);
  value.dispose();
  assert.equal(value.handlers.size, 0);
});

test("sender validation precedes payload and dependency access", async () => {
  const value = fixture();
  await assert.rejects(value.handlers.get(FILE_CHANNELS.uploadCanary)({}, { path: "/secret" }), (error) => error.code === "file_unavailable" && !error.message.includes("secret"));
  assert.deepEqual(value.calls.map(([name]) => name), ["sender"]);
});

test("file commands reject extensible payloads and invalid opaque IDs", async () => {
  const value = fixture();
  await assert.rejects(value.handlers.get(FILE_CHANNELS.choose)(value.event, {}), (error) => error.code === "file_unavailable");
  await assert.rejects(value.handlers.get(FILE_CHANNELS.downloadCanary)(value.event, {}), (error) => error.code === "file_unavailable");
  await assert.rejects(value.handlers.get(FILE_CHANNELS.uploadCanary)(value.event, "C:\\secret"), (error) => error.code === "file_capability_invalid");
  assert.equal(value.calls.some(([name]) => ["choose", "grant", "upload", "download"].includes(name)), false);
});
