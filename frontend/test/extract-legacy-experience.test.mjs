import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  extractLegacyExperience,
  extractWebRoutes,
} from '../scripts/extract-legacy-experience.mjs';

const repositoryUrl = new URL('../../', import.meta.url);

test('extractWebRoutes 支持单行、多行、链式 method 和命名空间调用', () => {
  const source = `
pub fn build_router() {
  Router::new()
    .route("/web", get(root))
    .route(
      "/web/items/{item_id}",
      get(show).post(update),
    )
    .route("/web/items", axum::routing::post(create))
    .route("/api/items", get(api_items))
}

fn next_function() {}
`;

  assert.deepEqual(extractWebRoutes(source), [
    { route: '/web', methods: ['GET'] },
    { route: '/web/items', methods: ['POST'] },
    { route: '/web/items/{item_id}', methods: ['GET', 'POST'] },
  ]);
});

test('正式 Web 来源可被稳定提取且不存在无 method 路由', async () => {
  const inventory = await extractLegacyExperience({
    routerPath: new URL('api/src/web/router.rs', repositoryUrl),
    templatesPath: new URL('api/templates/web', repositoryUrl),
  });

  assert.ok(inventory.routes.length > 40, '应覆盖正式 Web 页面和保留边界路由');
  assert.equal(inventory.templates.length, 6, '只应保留认证、下载和文档预览边界模板');
  assert.deepEqual(inventory.appInteractionMarkers, [], '旧 app.js 交互标记必须清零');
  assert.ok(inventory.templateInteractionMarkers.length > 10, '应覆盖文档预览边界交互标记');
  assert.equal(inventory.routes.some(({ methods }) => methods.length === 0), false);
  assert.ok(inventory.routes.some(({ route, methods }) => route === '/web/login' && methods.join(',') === 'GET,POST'));
  assert.equal(inventory.templates.some((template) => template.startsWith('system/')), false);
  assert.ok(inventory.templates.includes('document_preview.html'));
});

test('版本化来源清单与正式 Web 运行时来源完全一致', async () => {
  const [actual, expected] = await Promise.all([
    extractLegacyExperience({
      routerPath: new URL('api/src/web/router.rs', repositoryUrl),
      templatesPath: new URL('api/templates/web', repositoryUrl),
    }),
    readFile(new URL('../parity/legacy-source-inventory.json', import.meta.url), 'utf8').then(JSON.parse),
  ]);

  assert.equal(expected.version, 1);
  assert.deepEqual(actual.routes, expected.routes, 'Web route/method 已漂移，请更新体验来源清单');
  assert.deepEqual(actual.templates, expected.templates, 'Askama 模板已漂移，请更新体验来源清单');
  assert.deepEqual(actual.appInteractionMarkers, expected.appInteractionMarkers, 'app.js 交互标记已漂移，请更新体验来源清单');
  assert.deepEqual(actual.templateInteractionMarkers, expected.templateInteractionMarkers, '模板交互标记已漂移，请更新体验来源清单');
});
