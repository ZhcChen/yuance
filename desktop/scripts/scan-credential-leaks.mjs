import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const DEFAULT_ROOTS = [
  { root: "src", required: true },
  { root: "scripts", required: true },
  { root: "test/support", required: true },
  { root: "test/fixtures", required: false },
  { root: "dist", required: false },
];
const IGNORED_DIRECTORIES = new Set(["node_modules", ".git"]);
const TOKEN_SUFFIX = "[A-Za-z0-9_-]{24,}";
const RULES = [
  ["device access token", new RegExp(`yuance_dat_${TOKEN_SUFFIX}`, "g")],
  ["device refresh token", new RegExp(`yuance_drt_${TOKEN_SUFFIX}`, "g")],
  ["device authorization code", new RegExp(`yuance_dc_${TOKEN_SUFFIX}`, "g")],
  ["personal access token", new RegExp(`yuance_pat_${TOKEN_SUFFIX}`, "g")],
  ["literal bearer credential", new RegExp(`Bearer\\s+(?:yuance_(?:dat|drt|dc|pat)_)?${TOKEN_SUFFIX}`, "gi")],
  ["literal session cookie", /(?:^|[;\s])(?:session|refresh_token)=[A-Za-z0-9_-]{24,}/gi],
];
const ARTIFACT_RULES = [
  ["signed transfer URL", /https?:\/\/[^\s"']+[?&](?:x-amz-|signature=|expires=)[^\s"']*/gi],
  ["local filesystem path", /(?:[A-Za-z]:\\(?:Users|Windows)\\[^\r\n"']+|\/(?:Users|home|tmp)\/[^\r\n"']+)/g],
];
const TEXT_ARTIFACT_EXTENSIONS = new Set([".json", ".log", ".txt"]);

async function collectFiles(root) {
  const files = [];
  let metadata;
  try {
    metadata = await stat(root);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
  if (metadata.isFile()) return [root];

  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name)) continue;
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...(await collectFiles(target) || []));
    else if (entry.isFile()) files.push(target);
  }
  return files;
}

const roots = process.argv.slice(2);
const scanRoots = roots.length > 0
  ? roots.map((root) => ({ root, required: true }))
  : DEFAULT_ROOTS;
const discovered = await Promise.all(scanRoots.map(async ({ root, required }) => ({
  root,
  required,
  files: await collectFiles(root),
})));
const missing = discovered.filter(({ files }) => files === null);
const missingRequired = missing.filter(({ required }) => required);
if (missingRequired.length > 0) {
  for (const { root } of missingRequired) console.error(`credential leak scan root is missing: ${root}`);
  process.exit(1);
}
const existing = discovered.filter(({ files }) => files !== null);
const files = existing.flatMap(({ files }) => files);
if (files.length === 0) {
  console.error("credential leak scan found no files");
  process.exit(1);
}
const findings = [];

for (const file of files) {
  const content = (await readFile(file)).toString("latin1");
  const isTextArtifact = file.split(path.sep).includes("dist") && TEXT_ARTIFACT_EXTENSIONS.has(path.extname(file).toLowerCase());
  const rules = isTextArtifact ? [...RULES, ...ARTIFACT_RULES] : RULES;
  for (const [rule, pattern] of rules) {
    pattern.lastIndex = 0;
    if (pattern.test(content)) findings.push({ file, rule });
  }
}

if (findings.length > 0) {
  for (const finding of findings) {
    console.error(`credential leak: ${finding.rule} in ${finding.file}`);
  }
  process.exitCode = 1;
} else {
  const optionalMissing = missing.map(({ root }) => root);
  console.log(
    `credential leak scan passed (${files.length} files across ${existing.map(({ root }) => root).join(", ")})` +
    (optionalMissing.length > 0 ? `; optional roots missing: ${optionalMissing.join(", ")}` : ""),
  );
}
