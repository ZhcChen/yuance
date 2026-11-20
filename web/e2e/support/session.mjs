// e2e 共享前置步骤。这些步骤只为用例准备状态，不是被测对象，因此直接调用接口，
// 不依赖项目列表分页等界面细节（同一 worker 内先执行的用例可能新建大量项目）。
import { expect } from './fixtures.mjs';

/** 读取当前会话的 CSRF token（需已登录）。 */
export async function csrfHeaders(page) {
  const response = await page.request.get('/api/v1/auth/csrf');
  expect(response.ok(), `获取 CSRF token 失败：${response.status()}`).toBeTruthy();
  return { 'x-yuance-csrf-token': (await response.json()).data.csrf_token };
}

/** 将当前用户的当前项目设为指定项目。 */
export async function ensureCurrentProject(page, projectKey) {
  const response = await page.request.patch('/api/v1/current-project', {
    headers: await csrfHeaders(page),
    data: { project_key: projectKey },
  });
  expect(response.ok(), `设置当前项目失败：${response.status()} ${await response.text()}`).toBeTruthy();
}

/** 激活测试内存对象存储（每个 worker 的服务独立，配置不会影响其他 worker）。 */
export async function ensureMemoryStorage(page) {
  const response = await page.request.post('/api/v1/storage/config', {
    headers: await csrfHeaders(page),
    data: { endpoint: 'memory://yuance-tests', region: 'test', bucket: 'e2e', access_key_id: 'test-access-key', access_key_secret: 'test-access-secret', activate: true },
  });
  expect(response.status(), await response.text()).toBeLessThan(300);
}
