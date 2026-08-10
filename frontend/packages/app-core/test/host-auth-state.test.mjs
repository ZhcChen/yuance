import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizeHostAuthState,
  PUBLIC_HOST_AUTH_LOCKED_REASONS,
  PUBLIC_HOST_AUTH_STATES,
} from '@yuance/frontend-app-core';

test('normalizes public host auth states without forwarding extra fields', () => {
  for (const status of PUBLIC_HOST_AUTH_STATES) {
    assert.deepEqual(normalizeHostAuthState({ status, token: 'not-forwarded' }), { status });
  }
});

test('fails closed for malformed or unknown host auth states', () => {
  assert.deepEqual(normalizeHostAuthState(null), { status: 'fatal' });
  assert.deepEqual(normalizeHostAuthState({ status: 'admin' }), { status: 'fatal' });
});

test('forwards only allowlisted locked reasons', () => {
  assert.deepEqual(normalizeHostAuthState({ status: 'locked', reason: 'profile_mismatch' }), {
    status: 'locked',
    reason: 'profile_mismatch',
  });
  assert.deepEqual(normalizeHostAuthState({ status: 'locked', reason: 'pending_revocation' }), {
    status: 'locked',
  });
  assert.deepEqual(normalizeHostAuthState({ status: 'locked', reason: 'secret' }), {
    status: 'locked',
  });
  assert.deepEqual(PUBLIC_HOST_AUTH_LOCKED_REASONS, ['profile_mismatch']);
});
