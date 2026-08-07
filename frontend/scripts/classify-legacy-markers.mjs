import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CATEGORY_RULES = [
  ['transport', /(?:api-url|hx-|url|redirect|upload-url|complete-url|return-url)/],
  ['action', /(?:action|submit|open|close|toggle|remove|delete|retry|refresh|copy|download|preview|form|command|assign|move|tab-target)/],
  ['state', /(?:status|state|empty|pending|selected|count|progress|active|locked|ready|current|cache|complete)/],
  ['control', /(?:input|select|option|search|pagination|page|filter|checkbox|field|editor|tabs|trigger|scope)/],
];

export function classifyInteractionMarkers(inventory) {
  const appMarkers = new Set(inventory.appInteractionMarkers);
  const templateMarkers = new Set(inventory.templateInteractionMarkers);
  const markers = [...new Set([...appMarkers, ...templateMarkers])].sort();
  return markers.map((marker) => ({
    marker,
    category: CATEGORY_RULES.find(([, pattern]) => pattern.test(marker))?.[0] ?? 'presentation',
    sources: [appMarkers.has(marker) ? 'app-js' : null, templateMarkers.has(marker) ? 'template' : null].filter(Boolean),
  }));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const repositoryDirectory = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
  const inventory = JSON.parse(await readFile(path.join(repositoryDirectory, 'frontend/parity/legacy-source-inventory.json'), 'utf8'));
  const output = { version: 1, classifications: classifyInteractionMarkers(inventory) };
  const outputPath = path.join(repositoryDirectory, 'frontend/parity/interaction-marker-classification.json');
  await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);
  process.stdout.write(`${path.relative(repositoryDirectory, outputPath)}\n`);
}
