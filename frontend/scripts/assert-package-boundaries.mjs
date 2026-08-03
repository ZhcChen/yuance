#!/usr/bin/env node
import { builtinModules } from 'node:module';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const PACKAGE_PREFIX = '@yuance/frontend-';
const PACKAGE_RULES = {
  'platform-contract': {
    packageName: '@yuance/frontend-platform-contract',
    allowedInternalImports: [],
  },
  'api-client': {
    packageName: '@yuance/frontend-api-client',
    allowedInternalImports: [],
  },
  'app-core': {
    packageName: '@yuance/frontend-app-core',
    allowedInternalImports: [
      '@yuance/frontend-api-client',
      '@yuance/frontend-platform-contract',
    ],
  },
  'app-shell': {
    packageName: '@yuance/frontend-app-shell',
    allowedInternalImports: [
      '@yuance/frontend-api-client',
      '@yuance/frontend-app-core',
      '@yuance/frontend-platform-contract',
      '@yuance/frontend-ui',
    ],
  },
  ui: {
    packageName: '@yuance/frontend-ui',
    allowedInternalImports: [],
  },
};
const NODE_BUILTINS = new Set(
  builtinModules.flatMap((name) => [name, name.replace(/^node:/, '')]),
);
const IMPORT_PATTERN = /(?:import|export)\s+(?:[^'"]*\s+from\s+)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;
const FORBIDDEN_GLOBALS = [
  { pattern: /\bwindow\b/, label: 'window' },
  { pattern: /\bdocument\b/, label: 'document' },
  { pattern: /\bEventSource\b/, label: 'EventSource' },
  { pattern: /\bfetch\s*\(/, label: 'fetch()' },
  { pattern: /\blocalStorage\b/, label: 'localStorage' },
  { pattern: /\bsessionStorage\b/, label: 'sessionStorage' },
  { pattern: /\bprocess\b/, label: 'process' },
  { pattern: /\bBuffer\b/, label: 'Buffer' },
  { pattern: /\bglobal\b/, label: 'global' },
  { pattern: /\brequire\s*\(/, label: 'require()' },
  { pattern: /\bnavigator\b/, label: 'navigator' },
  { pattern: /\byuanceDesktop\b/, label: 'window.yuanceDesktop' },
];

/**
 * @param {string} dir
 * @returns {Promise<string[]>}
 */
async function listSourceFiles(dir) {
  /** @type {string[]} */
  const files = [];
  let entries = [];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error).code === 'ENOENT') {
      return files;
    }
    throw error;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listSourceFiles(fullPath));
      continue;
    }
    if (/\.(mjs|js|jsx)$/.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

/**
 * @param {string} source
 */
function packageRoot(source) {
  if (!source.startsWith(PACKAGE_PREFIX)) {
    return '';
  }
  const [scope, name] = source.split('/');
  return `${scope}/${name}`;
}

/**
 * @param {string} source
 * @param {string} absoluteFile
 * @param {string} workspaceRoot
 */
function packageRootFromRelativeImport(source, absoluteFile, workspaceRoot) {
  if (!source.startsWith('.')) {
    return '';
  }
  const resolvedSource = path.resolve(path.dirname(absoluteFile), source);
  const relativeSource = path.relative(workspaceRoot, resolvedSource).split(path.sep).join('/');
  const match = /^packages\/([^/]+)\//.exec(relativeSource);
  if (!match) {
    return '';
  }
  return PACKAGE_RULES[match[1]]?.packageName || '';
}

/**
 * @param {string} content
 */
function importSources(content) {
  /** @type {string[]} */
  const sources = [];
  for (const match of content.matchAll(IMPORT_PATTERN)) {
    sources.push(match[1] || match[2]);
  }
  return sources;
}

/**
 * @param {string} packageKey
 * @param {string} source
 * @param {string} file
 * @param {Record<string, Set<string>>} graph
 * @param {string} absoluteFile
 * @param {string} workspaceRoot
 * @returns {string[]}
 */
function validateImport(packageKey, source, file, graph, absoluteFile, workspaceRoot) {
  const rule = PACKAGE_RULES[packageKey];
  const failures = [];
  if (source === 'electron' || source === 'ipcRenderer' || source.startsWith('node:') || NODE_BUILTINS.has(source)) {
    failures.push(`${file}: 共享包禁止导入宿主或 Node 能力 "${source}"`);
  }

  const packageNameImport = packageRoot(source);
  const relativePackageImport = packageRootFromRelativeImport(source, absoluteFile, workspaceRoot);
  if (relativePackageImport && relativePackageImport !== rule.packageName) {
    failures.push(`${file}: 禁止相对路径跨包导入 "${source}"，请使用 package exports`);
  }

  const internalPackage = packageNameImport;
  if (internalPackage) {
    if (source !== internalPackage) {
      failures.push(`${file}: 禁止 deep import "${source}"，请使用 package exports`);
    }
    if (internalPackage === rule.packageName) {
      failures.push(`${file}: 共享包禁止通过包名导入自身 "${source}"`);
    } else if (!rule.allowedInternalImports.includes(internalPackage)) {
      failures.push(`${file}: ${rule.packageName} 不允许导入 ${internalPackage}`);
    } else {
      graph[rule.packageName].add(internalPackage);
    }
  }

  return failures;
}

/**
 * @param {Record<string, Set<string>>} graph
 */
function cycleFailures(graph) {
  const failures = [];
  const visiting = new Set();
  const visited = new Set();

  /**
   * @param {string} node
   * @param {string[]} stack
   */
  function visit(node, stack) {
    if (visiting.has(node)) {
      const cycleStart = stack.indexOf(node);
      failures.push(`共享包依赖存在循环: ${[...stack.slice(cycleStart), node].join(' -> ')}`);
      return;
    }
    if (visited.has(node)) {
      return;
    }
    visiting.add(node);
    for (const next of graph[node] || []) {
      visit(next, [...stack, next]);
    }
    visiting.delete(node);
    visited.add(node);
  }

  for (const node of Object.keys(graph)) {
    visit(node, [node]);
  }
  return failures;
}

/**
 * @param {string} workspaceRoot
 * @returns {Promise<string[]>}
 */
async function packageManifestFailures(workspaceRoot) {
  const failures = [];

  for (const [packageKey, rule] of Object.entries(PACKAGE_RULES)) {
    const manifestPath = path.join(workspaceRoot, 'packages', packageKey, 'package.json');
    let manifestContent = '';
    try {
      manifestContent = await readFile(manifestPath, 'utf8');
    } catch (error) {
      if (/** @type {NodeJS.ErrnoException} */ (error).code === 'ENOENT') {
        failures.push(`packages/${packageKey}/package.json: 缺少共享包 manifest`);
        continue;
      }
      throw error;
    }

    /** @type {{ name?: string, dependencies?: Record<string, string> }} */
    const manifest = JSON.parse(manifestContent);
    if (manifest.name !== rule.packageName) {
      failures.push(`packages/${packageKey}/package.json: package name 必须是 ${rule.packageName}`);
    }

    const declaredInternalDependencies = Object.keys(manifest.dependencies || {})
      .filter((dependencyName) => dependencyName.startsWith(PACKAGE_PREFIX))
      .sort();
    const allowedInternalImports = [...rule.allowedInternalImports].sort();

    for (const dependencyName of allowedInternalImports) {
      if (!declaredInternalDependencies.includes(dependencyName)) {
        failures.push(`packages/${packageKey}/package.json: 缺少内部依赖 ${dependencyName}`);
      }
    }
    for (const dependencyName of declaredInternalDependencies) {
      if (!allowedInternalImports.includes(dependencyName)) {
        failures.push(`packages/${packageKey}/package.json: 未允许的内部依赖 ${dependencyName}`);
      }
    }
  }

  return failures;
}

/**
 * @param {string} [workspaceRoot]
 * @returns {Promise<string[]>}
 */
export async function analyzePackageBoundaries(workspaceRoot = process.cwd()) {
  /** @type {string[]} */
  const failures = [];
  /** @type {Record<string, Set<string>>} */
  const graph = Object.fromEntries(
    Object.values(PACKAGE_RULES).map((rule) => [rule.packageName, new Set()]),
  );

  failures.push(...await packageManifestFailures(workspaceRoot));

  for (const packageKey of Object.keys(PACKAGE_RULES)) {
    const sourceRoot = path.join(workspaceRoot, 'packages', packageKey, 'src');
    const files = await listSourceFiles(sourceRoot);
    for (const file of files) {
      const relativeFile = path.relative(workspaceRoot, file);
      const content = await readFile(file, 'utf8');
      for (const source of importSources(content)) {
        failures.push(...validateImport(packageKey, source, relativeFile, graph, file, workspaceRoot));
      }
      for (const forbidden of FORBIDDEN_GLOBALS) {
        if (forbidden.pattern.test(content)) {
          failures.push(`${relativeFile}: 共享包源码禁止直接使用 ${forbidden.label}`);
        }
      }
    }
  }

  failures.push(...cycleFailures(graph));
  return failures;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const failures = await analyzePackageBoundaries();
  if (failures.length > 0) {
    console.error('frontend 共享包边界检查失败:');
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }
}
