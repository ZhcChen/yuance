import test from 'node:test';
import assert from 'node:assert/strict';

import { API_CLIENT_PACKAGE_NAME } from '@yuance/frontend-api-client';

test('api-client exposes package root marker', () => {
  assert.equal(API_CLIENT_PACKAGE_NAME, '@yuance/frontend-api-client');
});
