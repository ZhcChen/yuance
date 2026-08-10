import assert from 'node:assert/strict';
import test from 'node:test';

import { ApiError } from '@yuance/frontend-api-client';
import { errorMessage, globalApiErrorMessage } from '@yuance/frontend-app-shell';

test('mutation uncertainty requires refresh and states that no automatic retry occurs', () => {
  const error = new ApiError({
    code: 'mutation_result_uncertain',
    message: 'Mutation result is uncertain',
    status: 500,
  });

  assert.equal(
    errorMessage(error),
    '操作结果待确认，请刷新检查。系统不会自动重试本次操作。',
  );
});

test('other API and runtime errors retain their public message', () => {
  assert.equal(errorMessage(new ApiError({ code: 'forbidden', message: '无权操作。', status: 403 })), '无权操作。');
  assert.equal(errorMessage(new Error('网络不可用。')), '网络不可用。');
  assert.equal(errorMessage(null), '');
});

test('global API errors hide server internals while retaining actionable client errors', () => {
  assert.equal(globalApiErrorMessage(new ApiError({ code: 'database_error', message: 'decoder detail', status: 500 })), '服务暂时无法完成请求，请稍后重试。');
  assert.equal(globalApiErrorMessage(new ApiError({ code: 'forbidden', message: '无权操作。', status: 403 })), '无权操作。');
});
