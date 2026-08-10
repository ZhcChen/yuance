import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { SharedApp } from '@yuance/frontend-app-shell';

test('app-shell exposes the shared application composition root', () => {
  assert.equal(typeof SharedApp, 'function');
});

test('app-shell accesses host capabilities only through injected services', async () => {
  const source = await readFile(new URL('../src/app.jsx', import.meta.url), 'utf8');

  assert.doesNotMatch(
    source,
    /\b(?:window|document|navigator|localStorage|sessionStorage|yuanceDesktop)\b/,
  );
});
