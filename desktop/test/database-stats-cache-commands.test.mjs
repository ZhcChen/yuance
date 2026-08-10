import assert from "node:assert/strict";
import test from "node:test";

import { DATABASE_STATS_CACHE_CHANNELS, registerDatabaseStatsCacheCommandHandlers } from "../src/ipc/database-stats-cache-commands.mjs";

test("database stats cache IPC exposes only bounded read and write commands", async () => {
  const handlers = new Map();
  const calls = [];
  const snapshot = { refreshed_at: "2026-08-08T00:00:00Z", tables: [] };
  const dispose = registerDatabaseStatsCacheCommandHandlers({
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler), removeHandler: (channel) => calls.push(["remove", channel]) },
    assertSender: (event) => calls.push(["sender", event]),
    store: { read: async (username) => { calls.push(["read", username]); return snapshot; }, write: async (username, value) => { calls.push(["write", username, value]); return value; } },
  });
  const event = { sender: "trusted" };
  assert.deepEqual(await handlers.get(DATABASE_STATS_CACHE_CHANNELS.read)(event, "admin"), snapshot);
  assert.deepEqual(await handlers.get(DATABASE_STATS_CACHE_CHANNELS.write)(event, { username: "admin", snapshot }), snapshot);
  await assert.rejects(handlers.get(DATABASE_STATS_CACHE_CHANNELS.write)(event, { username: "admin", snapshot, path: "/tmp" }), /payload/i);
  assert.deepEqual(calls.slice(0, 4), [["sender", event], ["read", "admin"], ["sender", event], ["write", "admin", snapshot]]);
  dispose();
  assert.equal(calls.filter(([kind]) => kind === "remove").length, 2);
});
