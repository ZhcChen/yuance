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

test('shared shell keeps the 58px navigation outside the only business scroll container', async () => {
  const source = await readFile(new URL('../src/app.jsx', import.meta.url), 'utf8');
  const applicationStyles = await readFile(new URL('../src/application.css', import.meta.url), 'utf8');
  const uiStyles = await readFile(new URL('../../ui/src/styles.css', import.meta.url), 'utf8');
  const navigationIndex = source.indexOf('<GlobalNavigation');
  const mainIndex = source.indexOf('<main className="main">', navigationIndex);
  const routeLoadingIndex = source.indexOf('{loading ? (', navigationIndex);

  assert.match(source, /return \(\s*<div className="app-shell"/u);
  assert.ok(mainIndex > navigationIndex, '业务滚动容器必须位于稳定导航之后');
  assert.ok(routeLoadingIndex > mainIndex, 'route loading 必须留在业务滚动容器内');
  assert.match(applicationStyles, /\.app-shell \{[\s\S]*height: 100vh;[\s\S]*display: flex;[\s\S]*flex-direction: column;[\s\S]*overflow: hidden;/u);
  assert.match(applicationStyles, /\.main \{[\s\S]*min-height: 0;[\s\S]*overflow: auto;/u);
  assert.match(uiStyles, /--yc-topbar-height: 58px;/u);
  assert.match(uiStyles, /\.global-nav \{[\s\S]*flex: 0 0 var\(--yc-topbar-height\);[\s\S]*height: var\(--yc-topbar-height\);/u);
  assert.doesNotMatch(uiStyles, /\.global-nav \{[^}]*position: sticky;/u);
});
