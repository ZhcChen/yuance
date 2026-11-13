// @ts-check

import { ApiError } from '@yuance/frontend-api-client';

const NETWORK_ERROR_MESSAGE = '网络连接异常，请检查网络后重试。';

/** fetch 断网或被拦截时只抛浏览器原生 TypeError，各浏览器文案不同且是英文。 @param {Error} error */
function isNetworkError(error) {
  return error instanceof TypeError && /failed to fetch|networkerror|load failed|network request failed/iu.test(error.message || '');
}

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
  if (isNetworkError(error)) {
    return NETWORK_ERROR_MESSAGE;
  }
  return error.message || '加载失败。';
}

/** @param {unknown} error */
export function globalApiErrorMessage(error) {
  if (error instanceof ApiError && error.status >= 500) {
    return '服务暂时无法完成请求，请稍后重试。';
  }
  return errorMessage(error instanceof Error ? error : new Error('请求失败。'));
}
