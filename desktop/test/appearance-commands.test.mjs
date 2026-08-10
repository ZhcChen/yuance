import assert from "node:assert/strict";
import test from "node:test";

import { APPEARANCE_CHANNELS, registerAppearanceCommandHandlers } from "../src/ipc/appearance-commands.mjs";

test("appearance IPC validates sender, payload and fixed channels", async () => {
  const handlers = new Map();
  const removed = [];
  const calls = [];
  const dispose = registerAppearanceCommandHandlers({
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler), removeHandler: (channel) => removed.push(channel) },
    assertSender: (event) => calls.push(["sender", event]),
    store: { getTheme: async () => "dark", setTheme: async (theme) => { calls.push(["theme", theme]); return theme; } },
  });
  const event = { sender: "trusted" };
  assert.equal(await handlers.get(APPEARANCE_CHANNELS.getTheme)(event), "dark");
  assert.equal(await handlers.get(APPEARANCE_CHANNELS.setTheme)(event, "light"), "light");
  await assert.rejects(() => handlers.get(APPEARANCE_CHANNELS.setTheme)(event, "system"), /theme is invalid/);
  assert.deepEqual(calls, [["sender", event], ["sender", event], ["theme", "light"], ["sender", event]]);
  dispose();
  assert.deepEqual(removed.sort(), Object.values(APPEARANCE_CHANNELS).sort());
});
