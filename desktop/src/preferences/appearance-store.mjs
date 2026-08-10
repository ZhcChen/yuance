const THEMES = new Set(["light", "dark"]);

export function createAppearanceStore({ fs, filePath, platform = process.platform } = {}) {
  if (!fs || typeof fs.readFile !== "function" || typeof filePath !== "string" || !filePath) throw new TypeError("appearance store requires fs and filePath");

  async function getTheme() {
    try {
      const value = JSON.parse(await fs.readFile(filePath, "utf8"));
      return THEMES.has(value?.theme) ? value.theme : "light";
    } catch (error) {
      if (error?.code === "ENOENT" || error instanceof SyntaxError) return "light";
      throw error;
    }
  }

  let writeQueue = Promise.resolve();

  function setTheme(theme) {
    if (!THEMES.has(theme)) throw new TypeError("theme is invalid");
    writeQueue = writeQueue.catch(() => {}).then(() => persistTheme(theme));
    return writeQueue;
  }

  async function persistTheme(theme) {
    const directory = filePath.slice(0, Math.max(filePath.lastIndexOf("/"), filePath.lastIndexOf("\\"))) || ".";
    const temporary = `${filePath}.${process.pid}.tmp`;
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    await fs.writeFile(temporary, `${JSON.stringify({ theme })}\n`, { flag: "wx", mode: 0o600 });
    try {
      if (platform === "win32") await fs.unlink(filePath).catch((error) => { if (error?.code !== "ENOENT") throw error; });
      await fs.rename(temporary, filePath);
      if (platform !== "win32") await fs.chmod(filePath, 0o600);
    } finally {
      await fs.unlink(temporary).catch(() => {});
    }
    return theme;
  }

  return Object.freeze({ getTheme, setTheme });
}
