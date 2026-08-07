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
    appScriptPath: new URL('api/static/app.js', repositoryUrl),
  });

  assert.ok(inventory.routes.length > 70, '应覆盖正式 Web 页面和动作路由');
  assert.ok(inventory.templates.length > 20, '应覆盖保留的边界、系统和工作项模板');
  assert.ok(inventory.appInteractionMarkers.length > 50, '应覆盖 app.js 的主要交互标记');
  assert.ok(inventory.templateInteractionMarkers.length > 50, '应覆盖模板中的主要交互标记');
  assert.equal(inventory.routes.some(({ methods }) => methods.length === 0), false);
  assert.ok(inventory.routes.some(({ route, methods }) => route === '/web/login' && methods.join(',') === 'GET,POST'));
  assert.ok(inventory.templates.includes('system/users.html'));
  assert.ok(inventory.templates.includes('partials/work_item_detail.html'));
});

test('版本化来源清单与正式 Web 运行时来源完全一致', async () => {
  const [actual, expected] = await Promise.all([
    extractLegacyExperience({
      routerPath: new URL('api/src/web/router.rs', repositoryUrl),
      templatesPath: new URL('api/templates/web', repositoryUrl),
      appScriptPath: new URL('api/static/app.js', repositoryUrl),
    }),
    readFile(new URL('../parity/legacy-source-inventory.json', import.meta.url), 'utf8').then(JSON.parse),
  ]);

  assert.equal(expected.version, 1);
  assert.deepEqual(actual.routes, expected.routes, 'Web route/method 已漂移，请更新体验来源清单');
  assert.deepEqual(actual.templates, expected.templates, 'Askama 模板已漂移，请更新体验来源清单');
  assert.deepEqual(actual.appInteractionMarkers, expected.appInteractionMarkers, 'app.js 交互标记已漂移，请更新体验来源清单');
  assert.deepEqual(actual.templateInteractionMarkers, expected.templateInteractionMarkers, '模板交互标记已漂移，请更新体验来源清单');
});
