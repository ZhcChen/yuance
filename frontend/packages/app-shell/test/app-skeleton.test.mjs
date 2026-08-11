import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('initial session recovery renders a shared app shell skeleton', async () => {
  const source = await readFile(new URL('../src/app.jsx', import.meta.url), 'utf8');
  const skeleton = await readFile(new URL('../src/app-skeleton.jsx', import.meta.url), 'utf8');
  const styles = await readFile(new URL('../src/application.css', import.meta.url), 'utf8');

  assert.match(source, /if \(loading && !shellReady\) \{\s*return <AppShellSkeleton \/>;/u);
  assert.match(skeleton, /className="app-shell app-shell-skeleton"/u);
  assert.match(skeleton, /className="app-skeleton-nav"/u);
  assert.match(skeleton, /className="app-skeleton-main"/u);
  assert.match(skeleton, /正在恢复当前会话/u);
  assert.match(skeleton, /aria-hidden="true"/u);

  assert.match(styles, /\.app-skeleton-block \{[\s\S]*animation: yc-app-shimmer/u);
  assert.match(styles, /@keyframes yc-app-shimmer/u);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*\.app-skeleton-block \{ animation: none; \}/u);
});
