import assert from "node:assert/strict";
import test from "node:test";

import { createRevealDownloadController } from "../src/files/reveal-download-controller.mjs";

const binding = Object.freeze({ profileEpoch: 3, authorizationVersion: 7, webContentsId: 9, frameRoutingId: 2, purpose: "reveal-download" });
const locator = Object.freeze({ privatePath: "/private/report.txt", identity: Object.freeze({ dev: "1", ino: "2", size: "3", mtimeNs: "4", ctimeNs: "5" }) });

test("reveals an identity-matched target without returning its path", async () => {
  const calls = [];
  const controller = fixture({ calls });
  const result = await controller.reveal(`yrd_${"a".repeat(32)}`, binding);
  assert.deepEqual(result, { status: "revealed" });
  assert.deepEqual(calls, [["consume", `yrd_${"a".repeat(32)}`, binding], ["show", "/private/report.txt"]]);
  assert.equal(JSON.stringify(result).includes("private"), false);
});

test("rejects replaced, missing, symlink, and non-file targets before shell access", async () => {
  for (const mode of ["replaced", "missing", "symlink", "directory"]) {
    const calls = [];
    await assert.rejects(fixture({ calls, mode }).reveal(`yrd_${"c".repeat(32)}`, binding), (error) => error.code === "file_reveal_target_changed");
    assert.equal(calls.some(([name]) => name === "show"), false);
  }
});

test("consumes before verification and sanitizes shell failures", async () => {
  const consumed = new Set();
  const vault = { consume(capability) { if (consumed.has(capability)) throw Object.assign(new Error("replay"), { code: "file_reveal_invalid" }); consumed.add(capability); return locator; } };
  const controller = createRevealDownloadController({ vault, shell: { showItemInFolder() { throw new Error("/private/report.txt"); } }, lstat: async () => stats() });
  await assert.rejects(controller.reveal(`yrd_${"d".repeat(32)}`, binding), (error) => error.code === "file_reveal_unavailable" && !error.message.includes("private"));
  await assert.rejects(controller.reveal(`yrd_${"d".repeat(32)}`, binding), (error) => error.code === "file_reveal_invalid");
});

function fixture({ calls = [], mode = "valid" } = {}) {
  return createRevealDownloadController({
    vault: { consume(capability, actualBinding) { calls.push(["consume", capability, actualBinding]); return locator; } },
    shell: { showItemInFolder(value) { calls.push(["show", value]); } },
    lstat: async () => {
      if (mode === "missing") throw new Error("missing");
      return stats({ replaced: mode === "replaced", symlink: mode === "symlink", directory: mode === "directory" });
    },
  });
}

function stats({ replaced = false, symlink = false, directory = false } = {}) {
  return { dev: 1n, ino: replaced ? 99n : 2n, size: 3n, mtimeNs: 4n, ctimeNs: 5n, isSymbolicLink: () => symlink, isFile: () => !directory };
}
