import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('route loading preserves the mounted navigation shell after initial recovery', async () => {
  const source = await readFile(new URL('../src/app.jsx', import.meta.url), 'utf8');
  const styles = await readFile(new URL('../src/application.css', import.meta.url), 'utf8');
  const navigationIndex = source.indexOf('<GlobalNavigation');
  const routeLoadingIndex = source.indexOf('{loading ? (', navigationIndex);
  const routeContentIndex = source.indexOf('{error ? (', routeLoadingIndex);

  assert.match(source, /if \(loading && !shellReady\)/u);
  assert.ok(navigationIndex >= 0);
  assert.ok(routeLoadingIndex > navigationIndex);
  assert.ok(routeContentIndex > routeLoadingIndex);
  assert.match(source, /className="shell-route-loading"/u);
  assert.match(styles, /\.shell-route-loading \{[\s\S]*min-height: 420px;/u);
  assert.doesNotMatch(styles, /\.shell-route-loading[^}]*animation:/u);
});
