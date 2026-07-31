import test from 'node:test';
import assert from 'node:assert/strict';

import { UI_PACKAGE_NAME } from '@yuance/frontend-ui';

test('ui exposes package root marker', () => {
  assert.equal(UI_PACKAGE_NAME, '@yuance/frontend-ui');
});
