import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HTTP_METHOD_PATTERN = /(?:axum::routing::)?\b(get|post|put|patch|delete)\s*\(/g;
const DATA_MARKER_PATTERN = /\bdata-[a-z][a-z0-9-]*/g;

function findClosingParenthesis(source, openingIndex) {
  let depth = 0;
  let quote = null;
  let escaped = false;

  for (let index = openingIndex; index < source.length; index += 1) {
    const character = source[index];
    if (quote !== null) {
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === quote) {
        quote = null;
      }
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
    } else if (character === '(') {
      depth += 1;
    } else if (character === ')') {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }
  throw new Error(`无法匹配索引 ${openingIndex} 处的右括号`);
}

export function extractWebRoutes(routerSource) {
  const buildStart = routerSource.indexOf('pub fn build_router');
  const buildEnd = routerSource.indexOf('\nfn ', buildStart + 1);
  if (buildStart < 0 || buildEnd < 0) {
    throw new Error('无法定位 build_router 函数');
  }

  const buildSource = routerSource.slice(buildStart, buildEnd);
  const routes = [];
  let cursor = 0;
  while ((cursor = buildSource.indexOf('.route(', cursor)) >= 0) {
    const openingIndex = cursor + '.route'.length;
    const closingIndex = findClosingParenthesis(buildSource, openingIndex);
    const invocation = buildSource.slice(openingIndex + 1, closingIndex);
    const routeMatch = invocation.match(/^\s*"(\/web(?:\/[^"\\]*)?)"\s*,/);
    if (routeMatch) {
      const methods = [...invocation.matchAll(HTTP_METHOD_PATTERN)].map((match) => match[1].toUpperCase());
      routes.push({
        route: routeMatch[1],
        methods: [...new Set(methods)].sort(),
      });
    }
    cursor = closingIndex + 1;
  }
  return routes.sort((left, right) => left.route.localeCompare(right.route));
}

async function walkHtmlFiles(directory, root = directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walkHtmlFiles(entryPath, root));
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      files.push(path.relative(root, entryPath).split(path.sep).join('/'));
    }
  }
  return files.sort();
}

export async function extractLegacyExperience({ routerPath, templatesPath, appScriptPath }) {
  const templateDirectory = templatesPath instanceof URL ? fileURLToPath(templatesPath) : templatesPath;
  const [routerSource, appScript, templates] = await Promise.all([
    readFile(routerPath, 'utf8'),
    readFile(appScriptPath, 'utf8'),
    walkHtmlFiles(templateDirectory),
  ]);
  const templateMarkers = new Set();
  for (const template of templates) {
    const content = await readFile(path.join(templateDirectory, template), 'utf8');
    for (const marker of content.match(DATA_MARKER_PATTERN) ?? []) {
      templateMarkers.add(marker);
    }
  }

  return {
    routes: extractWebRoutes(routerSource),
    templates,
    appInteractionMarkers: [...new Set(appScript.match(DATA_MARKER_PATTERN) ?? [])].sort(),
    templateInteractionMarkers: [...templateMarkers].sort(),
  };
}

export async function writeLegacyExperienceInventory(repositoryDirectory) {
  const inventory = await extractLegacyExperience({
    routerPath: path.join(repositoryDirectory, 'api/src/web/router.rs'),
    templatesPath: path.join(repositoryDirectory, 'api/templates/web'),
    appScriptPath: path.join(repositoryDirectory, 'api/static/app.js'),
  });
  const outputPath = path.join(repositoryDirectory, 'frontend/parity/legacy-source-inventory.json');
  await writeFile(outputPath, `${JSON.stringify({ version: 1, ...inventory }, null, 2)}\n`);
  return outputPath;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const repositoryDirectory = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
  const outputPath = await writeLegacyExperienceInventory(repositoryDirectory);
  process.stdout.write(`${path.relative(repositoryDirectory, outputPath)}\n`);
}
