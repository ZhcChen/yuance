import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const makefile = await readFile(new URL('../Makefile', import.meta.url), 'utf8');

test('清理目标只作用于仓库内明确生成物', () => {
  assert.match(makefile, /clean-rust:[\s\S]*rm -rf -- target desktop\/native\/file-guard\/target/);
  assert.match(makefile, /clean-frontend-dist:[\s\S]*frontend\/packages\/\*\/dist/);
  assert.doesNotMatch(makefile, /cargo clean/);
  assert.doesNotMatch(makefile, /docker (?:system|volume|builder) prune/);
  assert.doesNotMatch(makefile, /rm -rf[^\n]*(?:\.local|(?:^|\s)data(?:\s|$)|backups)/);
});

test('清理状态命令包含受保护数据提示', () => {
  assert.match(makefile, /cache-status:[\s\S]*\.local/);
  assert.match(makefile, /受保护数据仅查看/);
});
