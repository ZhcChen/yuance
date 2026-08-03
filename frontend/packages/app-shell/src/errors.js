// @ts-check

import { ApiError } from '@yuance/frontend-api-client';

/** @param {ApiError | Error | null} error */
export function errorMessage(error) {
  if (!error) {
    return '';
  }
  if (error instanceof ApiError && error.code === 'mutation_result_uncertain') {
    return '操作结果待确认，请刷新检查。系统不会自动重试本次操作。';
  }
  if (error instanceof ApiError) {
    return error.message;
  }
  return error.message || '加载失败。';
}
