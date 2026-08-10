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

test('project menu scrollbar remains visible without reducing option width', async () => {
  const styles = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');

  assert.match(styles, /\.global-nav-project-options\s*\{[^}]*width:\s*calc\(100% \+ 8px\)/su);
  assert.match(styles, /\.global-nav-project-options\s*\{[^}]*margin-right:\s*-8px/su);
  assert.match(styles, /\.global-nav-project-options::-webkit-scrollbar\s*\{\s*width:\s*8px/su);
  assert.match(styles, /\.global-nav-project-options::-webkit-scrollbar-thumb\s*\{/u);
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
