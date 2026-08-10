import fs from "node:fs/promises";

export function createRevealDownloadController({ vault, shell, lstat = fs.lstat } = {}) {
  if (typeof vault?.consume !== "function" || typeof shell?.showItemInFolder !== "function" || typeof lstat !== "function") throw new TypeError("reveal download dependencies are required");

  async function reveal(capability, binding) {
    const locator = vault.consume(capability, binding);
    let stats;
    try { stats = await lstat(locator.privatePath, { bigint: true }); }
    catch { throw revealError("file_reveal_target_changed"); }
    if (stats.isSymbolicLink() || !stats.isFile() || !sameIdentity(locator.identity, identity(stats))) throw revealError("file_reveal_target_changed");
    try { shell.showItemInFolder(locator.privatePath); }
    catch { throw revealError("file_reveal_unavailable"); }
    return Object.freeze({ status: "revealed" });
  }

  return Object.freeze({ reveal });
}

function identity(stats) { return Object.freeze({ dev: String(stats.dev), ino: String(stats.ino), size: String(stats.size), mtimeNs: String(stats.mtimeNs), ctimeNs: String(stats.ctimeNs) }); }
function sameIdentity(left, right) { return Object.keys(right).every((key) => left[key] === right[key]); }
function revealError(code) { return Object.assign(new Error("Downloaded file cannot be revealed"), { code }); }
