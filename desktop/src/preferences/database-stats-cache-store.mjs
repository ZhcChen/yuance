const USERNAME = /^[A-Za-z0-9._@-]{1,128}$/u;
const MAX_TABLES = 500;
const MAX_COLUMNS = 500;

export function createDatabaseStatsCacheStore({ fs, filePath, platform = process.platform } = {}) {
  if (!fs || typeof fs.readFile !== "function" || typeof filePath !== "string" || !filePath) throw new TypeError("database stats cache store requires fs and filePath");
  let writeQueue = Promise.resolve();

  async function read(username) {
    const key = normalizeUsername(username);
    const entries = await readEntries();
    return entries[key] ?? null;
  }

  function write(username, snapshot) {
    const key = normalizeUsername(username);
    const normalized = normalizeSnapshot(snapshot);
    writeQueue = writeQueue.catch(() => {}).then(async () => {
      const entries = await readEntries();
      entries[key] = normalized;
      await persist({ version: 1, entries });
      return normalized;
    });
    return writeQueue;
  }

  async function readEntries() {
    try {
      const value = JSON.parse(await fs.readFile(filePath, "utf8"));
      if (!isExactObject(value, ["entries", "version"]) || value.version !== 1 || !isPlainObject(value.entries)) return {};
      const entries = {};
      for (const [username, snapshot] of Object.entries(value.entries).slice(0, 50)) {
        if (USERNAME.test(username)) entries[username] = normalizeSnapshot(snapshot);
      }
      return entries;
    } catch (error) {
      if (error?.code === "ENOENT" || error instanceof SyntaxError || error instanceof TypeError) return {};
      throw error;
    }
  }

  async function persist(value) {
    const directory = filePath.slice(0, Math.max(filePath.lastIndexOf("/"), filePath.lastIndexOf("\\"))) || ".";
    const temporary = `${filePath}.${process.pid}.tmp`;
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    await fs.writeFile(temporary, `${JSON.stringify(value)}\n`, { flag: "wx", mode: 0o600 });
    try {
      if (platform === "win32") await fs.unlink(filePath).catch((error) => { if (error?.code !== "ENOENT") throw error; });
      await fs.rename(temporary, filePath);
      if (platform !== "win32") await fs.chmod(filePath, 0o600);
    } finally {
      await fs.unlink(temporary).catch(() => {});
    }
  }

  return Object.freeze({ read, write });
}

export function normalizeDatabaseStatsSnapshot(value) {
  return normalizeSnapshot(value);
}

function normalizeSnapshot(value) {
  if (!isExactObject(value, ["refreshed_at", "tables"]) || typeof value.refreshed_at !== "string" || value.refreshed_at.length > 256 || !Array.isArray(value.tables) || value.tables.length > MAX_TABLES) throw new TypeError("database stats snapshot is invalid");
  return Object.freeze({
    refreshed_at: value.refreshed_at,
    tables: Object.freeze(value.tables.map((table) => {
      if (!isExactObject(table, ["column_count", "columns", "remark", "row_count", "table_name"]) || typeof table.table_name !== "string" || table.table_name.length > 256 || typeof table.remark !== "string" || table.remark.length > 4096 || !isCount(table.row_count) || !isCount(table.column_count) || !Array.isArray(table.columns) || table.columns.length > MAX_COLUMNS) throw new TypeError("database stats table is invalid");
      return Object.freeze({
        table_name: table.table_name, remark: table.remark, row_count: table.row_count, column_count: table.column_count,
        columns: Object.freeze(table.columns.map((column) => {
          if (!isExactObject(column, ["data_type", "default_value", "name", "primary_key", "required"]) || typeof column.name !== "string" || column.name.length > 256 || typeof column.data_type !== "string" || column.data_type.length > 256 || typeof column.required !== "boolean" || typeof column.primary_key !== "boolean" || !(column.default_value === null || (typeof column.default_value === "string" && column.default_value.length <= 4096))) throw new TypeError("database stats column is invalid");
          return Object.freeze({ name: column.name, data_type: column.data_type, required: column.required, primary_key: column.primary_key, default_value: column.default_value });
        })),
      });
    })),
  });
}

function normalizeUsername(value) {
  if (typeof value !== "string" || !USERNAME.test(value)) throw new TypeError("database stats cache username is invalid");
  return value;
}

function isCount(value) { return Number.isSafeInteger(value) && value >= 0; }
function isPlainObject(value) { return value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype; }
function isExactObject(value, keys) { return isPlainObject(value) && Object.keys(value).sort().join("\0") === keys.join("\0"); }
