import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { UI_PACKAGE_NAME } from '@yuance/frontend-ui';

test('ui exposes package root marker', () => {
  assert.equal(UI_PACKAGE_NAME, '@yuance/frontend-ui');
});

test('ui owns the shared light and dark design tokens', async () => {
  const source = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');
  for (const token of ['--yc-bg', '--yc-panel', '--yc-text', '--yc-brand', '--yc-danger', '--yc-control-height']) {
    assert.match(source, new RegExp(`${token}:`, 'u'));
  }
  assert.match(source, /html\[data-theme="dark"\]/u);
  assert.match(source, /\.yc-button\s*\{[^}]*text-decoration:\s*none;/su);
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

  assert.match(styles, /--yc-scrollbar-thumb-alpha:\s*30%;/u);
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
    readFile(new URL('../../../../desktop/src/renderer/app.css', import.meta.url), 'utf8'),
  ]);
  for (const source of hostStyles) {
    assert.doesNotMatch(source, /--yc-[a-z-]+\s*:/u);
  }
});
