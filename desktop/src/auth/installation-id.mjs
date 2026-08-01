import { randomUUID as nodeRandomUUID, randomBytes as nodeRandomBytes } from "node:crypto";

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;

export async function loadOrCreateInstallationId({
  fs,
  filePath,
  platform = process.platform,
  randomUUID = nodeRandomUUID,
  randomBytes = nodeRandomBytes,
} = {}) {
  if (!fs || typeof fs.open !== "function" || typeof filePath !== "string" || filePath.length === 0) {
    throw new TypeError("installation ID store requires fs and filePath");
  }
  await recoverWindowsBackup(fs, filePath, platform);
  try {
    const current = (await fs.readFile(filePath, "utf8")).trim();
    if (UUID.test(current)) return current;
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  const value = randomUUID();
  if (!UUID.test(value)) throw new TypeError("generated installation ID is invalid");
  const directory = parentDirectory(filePath);
  const temporary = `${filePath}.${randomBytes(12).toString("hex")}.tmp`;
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const handle = await fs.open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(`${value}\n`, "utf8");
    if (platform !== "win32") await handle.chmod(0o600);
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    if (platform === "win32") {
      await replaceWindowsFile(fs, temporary, filePath);
    } else {
      await fs.rename(temporary, filePath);
    }
    if (platform !== "win32") await fs.chmod(filePath, 0o600);
    await syncDirectory(fs, directory, platform);
  } finally {
    await fs.unlink(temporary).catch(() => {});
  }
  return value;
}

async function recoverWindowsBackup(fs, filePath, platform) {
  if (platform !== "win32") return;
  const backup = `${filePath}.previous`;
  const backupExists = await fileExists(fs, backup);
  if (!backupExists) return;
  if (await fileExists(fs, filePath)) {
    await fs.unlink(backup);
  } else {
    await fs.rename(backup, filePath);
  }
}

async function replaceWindowsFile(fs, temporary, filePath) {
  const backup = `${filePath}.previous`;
  let hasBackup = false;
  try {
    await fs.rename(filePath, backup);
    hasBackup = true;
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  try {
    await fs.rename(temporary, filePath);
    if (hasBackup) await fs.unlink(backup);
  } catch (error) {
    if (hasBackup) {
      await fs.unlink(filePath).catch(() => {});
      await fs.rename(backup, filePath).catch(() => {});
    }
    throw error;
  }
}

async function fileExists(fs, filePath) {
  try {
    await fs.stat(filePath);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

function parentDirectory(filePath) {
  const slash = Math.max(filePath.lastIndexOf("/"), filePath.lastIndexOf("\\"));
  return slash < 0 ? "." : filePath.slice(0, slash);
}

async function syncDirectory(fs, directory, platform) {
  if (platform === "win32") return;
  const handle = await fs.open(directory, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}
