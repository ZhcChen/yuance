#!/usr/bin/env node
import { readdir } from 'node:fs/promises';
import path from 'node:path';

const DISALLOWED_EXTENSIONS = new Set(['.ts', '.tsx', '.cts', '.mts', '.cjs']);

/**
 * @param {string[]} roots
 * @param {string} cwd
 * @returns {Promise<string[]>}
 */
export async function findDisallowedSourceFiles(roots, cwd = process.cwd()) {
  /** @type {string[]} */
  const invalidFiles = [];

  /**
   * @param {string} dir
   */
  async function walk(dir) {
    let entries = [];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (error) {
      if (/** @type {NodeJS.ErrnoException} */ (error).code === 'ENOENT') {
        return;
      }
      throw error;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === 'dist') {
          continue;
        }
        await walk(fullPath);
        continue;
      }
      if (DISALLOWED_EXTENSIONS.has(path.extname(entry.name))) {
        invalidFiles.push(path.relative(cwd, fullPath));
      }
    }
  }

  for (const root of roots) {
    await walk(path.resolve(cwd, root));
  }

  return invalidFiles.sort();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const roots = process.argv.slice(2);
  const invalidFiles = await findDisallowedSourceFiles(roots.length ? roots : ['packages']);
  if (invalidFiles.length > 0) {
    console.error('frontend 共享包不允许新增 TypeScript 或 CommonJS 源文件:');
    for (const file of invalidFiles) {
      console.error(`- ${file}`);
    }
    process.exit(1);
  }
}
