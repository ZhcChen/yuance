import test from 'node:test';
import assert from 'node:assert/strict';

import { APP_CORE_PACKAGE_NAME } from '@yuance/frontend-app-core';

test('app-core exposes package root marker', () => {
  assert.equal(APP_CORE_PACKAGE_NAME, '@yuance/frontend-app-core');
});
