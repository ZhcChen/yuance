import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';

import { UI_PACKAGE_NAME } from '@yuance/frontend-ui';

test('ui exposes package root marker', () => {
  assert.equal(UI_PACKAGE_NAME, '@yuance/frontend-ui');
});

test('ui owns the shared light and dark design tokens', async () => {
  const tokens = await readFile(new URL('../src/tokens.css', import.meta.url), 'utf8');
  const styles = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');
  for (const token of ['--yc-bg', '--yc-panel', '--yc-text', '--yc-brand', '--yc-danger', '--yc-control-height']) {
    assert.match(tokens, new RegExp(`${token}:`, 'u'));
  }
  assert.match(tokens, /html\[data-theme="dark"\]/u);
  assert.match(styles, /@import '\.\/tokens\.css';/u);
  assert.doesNotMatch(styles, /--yc-[a-z-]+\s*:/u);
  assert.match(styles, /\.yc-button\s*\{[^}]*text-decoration:\s*none;/su);
});

test('project menu delegates scrollbar rendering without reserving option width', async () => {
  const styles = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');
  const source = await readFile(new URL('../src/global-navigation.jsx', import.meta.url), 'utf8');

  assert.match(styles, /\.global-nav-project-options\s*\{[^}]*width:\s*100%/su);
  assert.doesNotMatch(styles, /\.global-nav-project-options\s*\{[^}]*margin-right:\s*-8px/su);
  assert.match(source, /className="global-nav-project-options yc-overlay-scroll-target"/u);
  assert.match(source, /useOverlayScrollbar\(\{ axis: 'vertical'/u);
});

test('shared scrollbars use fixed overlay tracks with 30% thumb opacity', async () => {
  const styles = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');
  const tokens = await readFile(new URL('../src/tokens.css', import.meta.url), 'utf8');

  assert.match(tokens, /--yc-scrollbar-thumb-alpha:\s*30%;/u);
  assert.match(styles, /html\.yc-overlay-scrollbars-enabled \*[\s\S]*scrollbar-width:\s*none !important;/u);
  assert.match(styles, /\.yc-overlay-scrollbar\s*\{[\s\S]*position:\s*fixed;/u);
  assert.match(styles, /background:\s*color-mix\(in srgb, var\(--yc-muted\) var\(--yc-scrollbar-thumb-alpha\), transparent\)/u);
  assert.doesNotMatch(styles, /@supports \(overflow: overlay\)/u);

  const source = await readFile(new URL('../src/overlay-scrollbar.jsx', import.meta.url), 'utf8');
  assert.match(source, /new view\.MutationObserver\(handleMutations\)/u);
  assert.match(source, /view\.addEventListener\('scroll', scheduleRecords, true\)/u);
});

test('host styles do not define shared business tokens', async () => {
  const hostStyles = await Promise.all([
    readFile(new URL('../../../../web/src/app.css', import.meta.url), 'utf8'),
  ]);
  for (const source of hostStyles) {
    assert.doesNotMatch(source, /--yc-[a-z-]+\s*:/u);
  }
});

test('every shared token reference resolves to a defined token', async () => {
  const tokenSource = await readFile(new URL('../src/tokens.css', import.meta.url), 'utf8');
  const defined = new Set([...tokenSource.matchAll(/(--yc-[a-zA-Z0-9-]+)\s*:/gu)].map((match) => match[1]));
  // 这几个由脚本在运行时写入，样式里只声明了回退值。
  const runtimeInjected = new Set([
    '--yc-content-tab-indicator-width',
    '--yc-content-tab-indicator-x',
    '--yc-global-nav-indicator-width',
    '--yc-global-nav-indicator-x',
  ]);

  const stylesheets = await Promise.all([
    readFile(new URL('../src/styles.css', import.meta.url), 'utf8'),
    readFile(new URL('../../app-shell/src/application.css', import.meta.url), 'utf8'),
    tokenSource,
  ]);

  // 局部自定义属性与内联样式里声明的变量
  const local = new Set();
  for (const source of stylesheets) {
    for (const match of source.matchAll(/(--[a-zA-Z0-9-]+)\s*:/gu)) local.add(match[1]);
  }
  const sourceDirectories = [
    new URL('../src/', import.meta.url),
    new URL('../../app-shell/src/', import.meta.url),
  ];
  for (const directory of sourceDirectories) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (!entry.isFile() || !/\.(jsx?|mjs)$/u.test(entry.name)) continue;
      const source = await readFile(new URL(entry.name, directory), 'utf8');
      for (const match of source.matchAll(/(--[a-zA-Z0-9-]+)\s*:/gu)) local.add(match[1]);
    }
  }

  const missing = new Set();
  for (const source of stylesheets) {
    // 带兜底值的引用视为已解析
    for (const match of source.matchAll(/var\((--[a-zA-Z0-9-]+)(\s*,|\s*\))/gu)) {
      if (match[2].trim() === ',') continue;
      if (defined.has(match[1]) || local.has(match[1]) || runtimeInjected.has(match[1])) continue;
      missing.add(match[1]);
    }
  }

  assert.deepEqual([...missing].sort(), [], '样式里引用了未定义的变量');
});
