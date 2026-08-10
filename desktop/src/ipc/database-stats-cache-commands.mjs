import { normalizeDatabaseStatsSnapshot } from "../preferences/database-stats-cache-store.mjs";

export const DATABASE_STATS_CACHE_CHANNELS = Object.freeze({
  read: "yuance:database-stats-cache-read",
  write: "yuance:database-stats-cache-write",
});

export function registerDatabaseStatsCacheCommandHandlers({ ipcMain, assertSender, store } = {}) {
  if (!ipcMain || typeof ipcMain.handle !== "function" || typeof ipcMain.removeHandler !== "function") throw new TypeError("ipcMain is required");
  if (typeof assertSender !== "function" || !store || typeof store.read !== "function" || typeof store.write !== "function") throw new TypeError("database stats cache command dependencies are required");
  const handlers = {
    [DATABASE_STATS_CACHE_CHANNELS.read]: async (event, username) => {
      assertSender(event);
      return store.read(username);
    },
    [DATABASE_STATS_CACHE_CHANNELS.write]: async (event, payload) => {
      assertSender(event);
      if (!payload || Object.keys(payload).sort().join("\0") !== "snapshot\0username") throw new TypeError("database stats cache payload is invalid");
      return store.write(payload.username, normalizeDatabaseStatsSnapshot(payload.snapshot));
    },
  };
  for (const [channel, handler] of Object.entries(handlers)) ipcMain.handle(channel, handler);
  return () => { for (const channel of Object.keys(handlers)) ipcMain.removeHandler(channel); };
}
