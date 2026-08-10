import test from 'node:test';
import assert from 'node:assert/strict';

import { PLATFORM_CONTRACT_PACKAGE_NAME } from '@yuance/frontend-platform-contract';

test('platform-contract exposes package root marker', () => {
  assert.equal(PLATFORM_CONTRACT_PACKAGE_NAME, '@yuance/frontend-platform-contract');
});
