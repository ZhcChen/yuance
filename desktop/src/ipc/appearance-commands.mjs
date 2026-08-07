export const APPEARANCE_CHANNELS = Object.freeze({
  getTheme: "yuance:appearance-get-theme",
  setTheme: "yuance:appearance-set-theme",
});

export function registerAppearanceCommandHandlers({ ipcMain, assertSender, store } = {}) {
  if (!ipcMain || typeof ipcMain.handle !== "function" || typeof ipcMain.removeHandler !== "function") throw new TypeError("ipcMain is required");
  if (typeof assertSender !== "function" || !store || typeof store.getTheme !== "function" || typeof store.setTheme !== "function") throw new TypeError("appearance command dependencies are required");
  const handlers = {
    [APPEARANCE_CHANNELS.getTheme]: async (event, payload) => {
      assertSender(event);
      if (payload !== undefined) throw new TypeError("getTheme does not accept a payload");
      return store.getTheme();
    },
    [APPEARANCE_CHANNELS.setTheme]: async (event, theme) => {
      assertSender(event);
      if (theme !== "light" && theme !== "dark") throw new TypeError("theme is invalid");
      return store.setTheme(theme);
    },
  };
  for (const [channel, handler] of Object.entries(handlers)) ipcMain.handle(channel, handler);
  return () => { for (const channel of Object.keys(handlers)) ipcMain.removeHandler(channel); };
}
