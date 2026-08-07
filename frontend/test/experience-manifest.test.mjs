import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';

const manifestUrl = new URL('../parity/experience-manifest.json', import.meta.url);
const schemaUrl = new URL('../parity/experience-manifest.schema.json', import.meta.url);
const sourceInventoryUrl = new URL('../parity/legacy-source-inventory.json', import.meta.url);

const allowedExceptionCodes = [
  'auth.transport',
  'file.picker',
  'file.save',
  'notification.native',
  'route.transport',
  'window.lifecycle',
];

async function readJson(url) {
  return JSON.parse(await readFile(url, 'utf8'));
}

test('体验清单 schema 使用封闭对象和受控宿主差异枚举', async () => {
  const schema = await readJson(schemaUrl);

  assert.equal(schema.additionalProperties, false);
  for (const definition of ['page', 'action', 'hostException', 'evidence']) {
    assert.equal(schema.$defs[definition].additionalProperties, false, `${definition} 必须拒绝未知字段`);
  }
  assert.deepEqual([...schema.$defs.hostException.properties.code.enum].sort(), allowedExceptionCodes);
});

test('体验清单登记全部且仅登记允许的宿主差异', async () => {
  const manifest = await readJson(manifestUrl);
  const codes = manifest.hostExceptions.map(({ code }) => code).sort();

  assert.deepEqual(codes, allowedExceptionCodes);
  assert.equal(new Set(codes).size, codes.length);
  for (const exception of manifest.hostExceptions) {
    assert.ok(exception.capability.length > 0);
    assert.ok(exception.browserBehavior.length > 0);
    assert.ok(exception.desktopBehavior.length > 0);
    assert.ok(exception.sharedOutcome.length > 0);
    assert.ok(exception.tests.length >= 2, `${exception.code} 必须同时登记 Browser/Desktop 证据`);
    for (const evidencePath of exception.tests) {
      await access(new URL(`../../${evidencePath}`, import.meta.url));
    }
  }
});

test('体验清单 ID 和引用保持唯一且闭合', async () => {
  const [manifest, sourceInventory] = await Promise.all([
    readJson(manifestUrl),
    readJson(sourceInventoryUrl),
  ]);
  const pageIds = manifest.pages.map(({ id }) => id);
  const actionIds = manifest.actions.map(({ id }) => id);
  const routeMethods = new Map(sourceInventory.routes.map(({ route, methods }) => [route, methods]));
  const templates = new Set(sourceInventory.templates);

  assert.equal(new Set(pageIds).size, pageIds.length, 'page id 不得重复');
  assert.equal(new Set(actionIds).size, actionIds.length, 'action id 不得重复');
  for (const page of manifest.pages) {
    assert.ok(routeMethods.has(page.route), `${page.id} 引用了不存在的正式 Web route ${page.route}`);
    for (const method of page.methods) {
      assert.ok(routeMethods.get(page.route).includes(method), `${page.id} 登记了不存在的 ${method} ${page.route}`);
    }
    for (const template of page.sourceTemplates) {
      assert.ok(templates.has(template), `${page.id} 引用了不存在的模板 ${template}`);
    }
  }
  for (const action of manifest.actions) {
    assert.ok(pageIds.includes(action.pageId), `${action.id} 引用了不存在的页面 ${action.pageId}`);
    assert.ok(routeMethods.get(action.request.path)?.includes(action.request.method), `${action.id} 引用了不存在的正式 Web 请求 ${action.request.method} ${action.request.path}`);
  }
});

test('完成态清单不得留下空页面或动作基线', async () => {
  const manifest = await readJson(manifestUrl);

  if (manifest.status === 'complete') {
    assert.ok(manifest.pages.length > 0);
    assert.ok(manifest.actions.length > 0);
  }
});

test('页面只拥有读取入口且每个 route method 只有一个 contract owner', async () => {
  const manifest = await readJson(manifestUrl);
  const owners = new Map();
  const register = (signature, owner) => {
    assert.equal(owners.has(signature), false, `${signature} 同时被 ${owners.get(signature)} 和 ${owner} 登记`);
    owners.set(signature, owner);
  };

  for (const page of manifest.pages) {
    assert.deepEqual(page.methods, ['GET'], `${page.id} 的写操作必须拆成 action`);
    register(`GET ${page.route}`, page.id);
  }
  for (const action of manifest.actions) {
    register(`${action.request.method} ${action.request.path}`, action.id);
  }
});
