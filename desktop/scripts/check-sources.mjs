import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';

const CONCURRENCY = 8;

function collectFiles(argv) {
  const files = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--file-list') {
      const lines = readFileSync(argv[index + 1], 'utf8').split('\n');
      for (const line of lines) {
        const file = line.trim();
        if (file && !file.startsWith('#')) {
          files.push(file);
        }
      }
      index += 1;
    } else {
      files.push(argv[index]);
    }
  }
  return files;
}

function checkFile(file) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['--check', file], {
      stdio: ['ignore', 'inherit', 'inherit'],
    });
    child.once('exit', (code, signal) => {
      resolve({ file, ok: code === 0 && signal === null });
    });
  });
}

const files = collectFiles(process.argv.slice(2));
if (files.length === 0) {
  console.error('用法: node ./scripts/check-sources.mjs [--file-list <清单>] <文件>...');
  process.exit(2);
}

const results = new Array(files.length);
let cursor = 0;

async function worker() {
  while (cursor < files.length) {
    const index = cursor;
    cursor += 1;
    results[index] = await checkFile(files[index]);
  }
}

await Promise.all(Array.from({ length: Math.min(CONCURRENCY, files.length) }, worker));

const failed = results.filter((result) => !result.ok);
for (const { file } of failed) {
  console.error(`语法检查失败: ${file}`);
}
process.exit(failed.length === 0 ? 0 : 1);
