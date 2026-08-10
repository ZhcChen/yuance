#!/usr/bin/env node
import { readdir } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve('src');
const invalidFiles = [];

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(fullPath);
      continue;
    }
    if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
      invalidFiles.push(path.relative(process.cwd(), fullPath));
    }
  }
}

await walk(root);

if (invalidFiles.length > 0) {
  console.error('web/src 不允许新增 .ts / .tsx 源文件:');
  for (const file of invalidFiles) {
    console.error(`- ${file}`);
  }
  process.exit(1);
}
