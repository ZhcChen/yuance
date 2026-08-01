#!/usr/bin/env node
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const root = path.resolve("src/renderer");
const failures = [];
/** @type {Array<[RegExp, string]>} */
const forbidden = [
  [/\bdocument\.cookie\b/, "Cookie"],
  [/\bEventSource\b/, "EventSource"],
  [/\bfetch\s*\(/, "fetch()"],
  [/\blocalStorage\b/, "localStorage"],
  [/\bsessionStorage\b/, "sessionStorage"],
  [/\b(?:process|Buffer|require)\b/, "Node global"],
];

async function inspect(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await inspect(filePath);
      continue;
    }
    if (/\.tsx?$/.test(entry.name)) failures.push(`${filePath}: Desktop renderer 只允许 JavaScript/JSDoc`);
    if (!/\.(?:js|jsx)$/.test(entry.name)) continue;
    const source = await readFile(filePath, "utf8");
    for (const [pattern, label] of forbidden) {
      if (pattern.test(source)) failures.push(`${filePath}: 禁止直接使用 ${label}`);
    }
  }
}

await inspect(root);
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
