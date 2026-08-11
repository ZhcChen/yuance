import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createFileSpool } from "../src/files/file-spool.mjs";

const posixTest = process.platform === "win32" ? test.skip : test;

async function fixture(t, limits = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "yuance-file-spool-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const spool = createFileSpool({ rootDirectory: path.join(root, "private"), ...limits });
  await spool.initialize();
  return { root, spool };
}

posixTest("streams an immutable private snapshot with size and sha256", async (t) => {
  const { root, spool } = await fixture(t);
  const source = path.join(root, "plan.txt");
  await fs.writeFile(source, "file snapshot");
  const snapshot = await spool.capture(source, { filename: "plan.txt", contentType: "text/plain" });
  t.after(() => snapshot.remove());

  assert.equal(snapshot.byteSize, 13);
  assert.equal(snapshot.sha256, "4149f058e9fd1d7d04413f52ee06f55bebaf4159dc1b39d15fc13092f9555328");
  assert.equal(snapshot.filename, "plan.txt");
  assert.equal(snapshot.contentType, "text/plain");
  assert.equal(await fs.readFile(snapshot.privatePath, "utf8"), "file snapshot");
  await fs.writeFile(source, "changed after capture");
  assert.equal(await fs.readFile(snapshot.privatePath, "utf8"), "file snapshot");
  if (process.platform !== "win32") {
    assert.equal((await fs.stat(path.dirname(snapshot.privatePath))).mode & 0o777, 0o700);
    assert.equal((await fs.stat(snapshot.privatePath)).mode & 0o777, 0o600);
  }
});

posixTest("captures pasted bytes into a private snapshot and removes the temp source", async (t) => {
  const { root, spool } = await fixture(t);
  const bytes = Buffer.from("pasted png");
  const snapshot = await spool.captureBuffer(bytes, { filename: "clip.png", contentType: "image/png" });
  t.after(() => snapshot.remove());

  assert.equal(snapshot.byteSize, bytes.length);
  assert.equal(snapshot.sha256, "9172eed1203658fc8de284965e312f6ad69295a686bc773903f8cdea426442f2");
  assert.equal(snapshot.filename, "clip.png");
  assert.equal(snapshot.contentType, "image/png");
  assert.deepEqual(await fs.readFile(snapshot.privatePath), bytes);
  assert.deepEqual((await fs.readdir(spool.rootDirectory)).filter((name) => name.startsWith(".paste-")), []);
});

posixTest("preserves canonical MIME parameters and rejects injected values", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "yuance-file-spool-mime-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const source = path.join(root, "source.txt");
  await fs.writeFile(source, "test");
  const spool = createFileSpool({ rootDirectory: path.join(root, "spool") });
  const canonical = await spool.capture(source, { filename: "source.txt", contentType: "text/plain; charset=utf-8" });
  assert.equal(canonical.contentType, "text/plain; charset=utf-8");
  await canonical.remove();
  const rejected = await spool.capture(source, { filename: "source.txt", contentType: "text/plain\r\nx: injected" });
  assert.equal(rejected.contentType, "application/octet-stream");
  await rejected.remove();
});

posixTest("rejects files above fixed limits and leaves no partial snapshot", async (t) => {
  const { root, spool } = await fixture(t, { maxFileBytes: 4, maxTotalBytes: 6 });
  const source = path.join(root, "large.bin");
  await fs.writeFile(source, "12345");
  await assert.rejects(spool.capture(source, { filename: "large.bin" }), (error) => error.code === "file_too_large");
  assert.deepEqual(await fs.readdir(spool.rootDirectory), [".yuance-file-spool-v1"]);
});

posixTest("rejects path replacement during capture and removes the partial snapshot", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "yuance-file-spool-race-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const source = path.join(root, "source.bin");
  const replaced = path.join(root, "original.bin");
  await fs.writeFile(source, Buffer.alloc(128 * 1024, 7));
  let replacedOnce = false;
  const injectedFs = {
    ...fs,
    open: async (candidate, ...args) => {
      const handle = await fs.open(candidate, ...args);
      if (!String(candidate).includes(".capture-")) return handle;
      return new Proxy(handle, {
        get(target, property) {
          if (property === "write") return async (...writeArgs) => {
            const result = await target.write(...writeArgs);
            if (!replacedOnce) {
              replacedOnce = true;
              await fs.rename(source, replaced);
              await fs.writeFile(source, "replacement");
            }
            return result;
          };
          const value = target[property];
          return typeof value === "function" ? value.bind(target) : value;
        },
      });
    },
  };
  const spool = createFileSpool({ rootDirectory: path.join(root, "private"), fs: injectedFs });
  await spool.initialize();
  await assert.rejects(spool.capture(source, { filename: "source.bin" }), (error) => error.code === "file_identity_changed");
  assert.deepEqual(await fs.readdir(spool.rootDirectory), [".yuance-file-spool-v1"]);
});

posixTest("rejects deletion, growth, truncation, and same-size modification during capture", async (t) => {
  for (const mutation of ["delete", "grow", "truncate", "same-size"]) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), `yuance-file-spool-${mutation}-`));
    t.after(() => fs.rm(root, { recursive: true, force: true }));
    const source = path.join(root, "source.bin");
    const original = Buffer.alloc(128 * 1024, 3);
    await fs.writeFile(source, original);
    let mutated = false;
    const injectedFs = {
      ...fs,
      open: async (candidate, ...args) => {
        const handle = await fs.open(candidate, ...args);
        if (!String(candidate).includes(".capture-")) return handle;
        return new Proxy(handle, {
          get(target, property) {
            if (property === "write") return async (...writeArgs) => {
              const result = await target.write(...writeArgs);
              if (!mutated) {
                mutated = true;
                if (mutation === "delete") await fs.unlink(source);
                if (mutation === "grow") await fs.appendFile(source, "growth");
                if (mutation === "truncate") await fs.truncate(source, 1);
                if (mutation === "same-size") await fs.writeFile(source, Buffer.alloc(original.length, 9));
              }
              return result;
            };
            const value = target[property];
            return typeof value === "function" ? value.bind(target) : value;
          },
        });
      },
    };
    const spool = createFileSpool({ rootDirectory: path.join(root, "private"), fs: injectedFs });
    await assert.rejects(spool.capture(source, { filename: "source.bin" }), `${mutation} must fail closed`);
    assert.deepEqual(await fs.readdir(spool.rootDirectory), [".yuance-file-spool-v1"]);
  }
});

posixTest("cleanup removes only owned snapshot files and preserves unknown entries", async (t) => {
  const { spool } = await fixture(t);
  const owned = path.join(spool.rootDirectory, "snapshot-0123456789abcdef0123456789abcdef.bin");
  const unknown = path.join(spool.rootDirectory, "keep.txt");
  await fs.writeFile(owned, "old");
  await fs.writeFile(unknown, "keep");
  assert.deepEqual(await spool.cleanupOrphans(), { removed: 1 });
  assert.deepEqual((await fs.readdir(spool.rootDirectory)).sort(), [".yuance-file-spool-v1", "keep.txt"]);
});

posixTest("retries partial writes until the complete snapshot is durable", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "yuance-file-spool-short-write-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const source = path.join(root, "source.bin");
  await fs.writeFile(source, "complete snapshot bytes");
  let partialWrites = 0;
  const injectedFs = {
    ...fs,
    open: async (candidate, ...args) => {
      const handle = await fs.open(candidate, ...args);
      if (!String(candidate).includes(".capture-")) return handle;
      return new Proxy(handle, {
        get(target, property) {
          if (property === "write") return async (buffer, offset, length) => {
            partialWrites += 1;
            return target.write(buffer, offset, Math.max(1, Math.floor(length / 2)));
          };
          const value = target[property];
          return typeof value === "function" ? value.bind(target) : value;
        },
      });
    },
  };
  const spool = createFileSpool({ rootDirectory: path.join(root, "private"), fs: injectedFs });
  const snapshot = await spool.capture(source, { filename: "source.bin" });
  t.after(() => snapshot.remove());
  assert.equal(partialWrites > 1, true);
  assert.equal(await fs.readFile(snapshot.privatePath, "utf8"), "complete snapshot bytes");
});

posixTest("refuses to claim an existing unmarked directory", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "yuance-file-spool-unowned-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const spoolRoot = path.join(root, "existing");
  await fs.mkdir(spoolRoot);
  await fs.writeFile(path.join(spoolRoot, "snapshot-0123456789abcdef0123456789abcdef.bin"), "foreign");
  const spool = createFileSpool({ rootDirectory: spoolRoot });
  await assert.rejects(spool.cleanupOrphans(), (error) => error.code === "file_spool_unavailable");
  assert.equal(await fs.readFile(path.join(spoolRoot, "snapshot-0123456789abcdef0123456789abcdef.bin"), "utf8"), "foreign");
});

posixTest("rolls back a newly created spool when marker initialization fails", async (t) => {
  for (const failure of ["writeFile", "sync"]) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), `yuance-file-spool-init-${failure}-`));
    t.after(() => fs.rm(root, { recursive: true, force: true }));
    const spoolRoot = path.join(root, "private");
    let failed = false;
    const injectedFs = {
      ...fs,
      open: async (candidate, ...args) => {
        const handle = await fs.open(candidate, ...args);
        if (path.basename(String(candidate)) !== ".yuance-file-spool-v1") return handle;
        return new Proxy(handle, {
          get(target, property) {
            if (property === failure) return async (...operationArgs) => {
              if (!failed) {
                failed = true;
                throw new Error(`injected marker ${failure} failure`);
              }
              return target[property](...operationArgs);
            };
            const value = target[property];
            return typeof value === "function" ? value.bind(target) : value;
          },
        });
      },
    };
    const failingSpool = createFileSpool({ rootDirectory: spoolRoot, fs: injectedFs });
    await assert.rejects(failingSpool.initialize(), new RegExp(`injected marker ${failure} failure`));
    await assert.rejects(fs.lstat(spoolRoot), (error) => error.code === "ENOENT");
    await createFileSpool({ rootDirectory: spoolRoot }).initialize();
    assert.deepEqual(await fs.readdir(spoolRoot), [".yuance-file-spool-v1"]);
  }
});

posixTest("serializes startup cleanup before capture", async (t) => {
  const { root, spool } = await fixture(t);
  const orphan = path.join(spool.rootDirectory, "snapshot-0123456789abcdef0123456789abcdef.bin");
  const source = path.join(root, "source.txt");
  await fs.writeFile(orphan, "orphan");
  await fs.writeFile(source, "current");
  const [cleanup, snapshot] = await Promise.all([
    spool.cleanupOrphans(),
    spool.capture(source, { filename: "source.txt" }),
  ]);
  t.after(() => snapshot.remove());
  assert.deepEqual(cleanup, { removed: 1 });
  assert.equal(await fs.readFile(snapshot.privatePath, "utf8"), "current");
});
