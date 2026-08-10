import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import Ajv2020 from 'ajv/dist/2020.js';

const contractUrl = new URL('../parity/main-web-visual-contract.json', import.meta.url);
const schemaUrl = new URL('../parity/main-web-visual-contract.schema.json', import.meta.url);
const experienceUrl = new URL('../parity/experience-manifest.json', import.meta.url);

const baselineCommit = '6c0e56daa5460a9725ee00b8937124d390e9bd0b';
const viewports = ['390x844', '768x1024', '1280x800', '1440x900'];
const noBaselinePages = ['page.boundary.device-authorization', 'page.boundary.shared-app'];
const fixtureGaps = [
  'page.project.cycle-detail',
  'page.project.resource-detail',
];

async function readJson(url) {
  return JSON.parse(await readFile(url, 'utf8'));
}

function assertClosedObjects(schema, path = '#') {
  if (!schema || typeof schema !== 'object') return;
  if (schema.type === 'object') {
    assert.equal(schema.additionalProperties, false, `${path} 必须拒绝未知字段`);
  }
  for (const [key, value] of Object.entries(schema)) {
    if (key !== 'properties') assertClosedObjects(value, `${path}/${key}`);
  }
  for (const [key, value] of Object.entries(schema.properties ?? {})) {
    assertClosedObjects(value, `${path}/properties/${key}`);
  }
}

test('main Web 视觉合同通过封闭的 Draft 2020 schema', async () => {
  const [contract, schema] = await Promise.all([readJson(contractUrl), readJson(schemaUrl)]);
  const validate = new Ajv2020({ allErrors: true }).compile(schema);

  assert.equal(validate(contract), true, JSON.stringify(validate.errors, null, 2));
  assertClosedObjects(schema);
});

test('视觉合同固定基线提交、CSS 来源和四个验收视口', async () => {
  const contract = await readJson(contractUrl);

  assert.deepEqual(contract.baseline, {
    branch: 'main',
    commit: baselineCommit,
    stylesheet: 'api/static/app.css',
    layoutTemplate: 'api/templates/layouts/web.html',
  });
  assert.deepEqual(contract.viewports.map(({ width, height }) => `${width}x${height}`), viewports);
  assert.equal(contract.tokens.topbarHeight, '58px');
  assert.deepEqual(contract.breakpoints, [1280, 1100, 980, 920, 900, 860, 760, 620]);
  assert.equal(contract.globalShell.geometryTolerancePx, 2);
  assert.deepEqual(contract.globalShell.regionOrder, ['topbar', 'main']);
});

test('视觉合同与体验清单 30 页双向闭合并完整分配 V2-V10', async () => {
  const [contract, experience] = await Promise.all([readJson(contractUrl), readJson(experienceUrl)]);
  const contractIds = contract.pages.map(({ id }) => id).sort();
  const experienceIds = experience.pages.map(({ id }) => id).sort();

  assert.deepEqual(contractIds, experienceIds);
  assert.equal(new Set(contractIds).size, 30);
  assert.deepEqual(
    [...new Set(contract.pages.map(({ visualUnit }) => visualUnit))].sort(),
    ['V10', 'V2', 'V3', 'V4', 'V5', 'V6', 'V7', 'V8', 'V9'],
  );
});

test('运行页面登记稳定锚点、几何、样式和响应式状态', async () => {
  const contract = await readJson(contractUrl);

  for (const page of contract.pages) {
    assert.ok(['runtime', 'static', 'boundary', 'no-baseline'].includes(page.evidenceMode));
    if (page.evidenceMode !== 'runtime') continue;
    assert.ok(page.stableAnchors.length > 0, `${page.id} 缺少稳定锚点`);
    assert.ok(page.geometryAnchors.length > 0, `${page.id} 缺少几何锚点`);
    assert.ok(page.computedStyleProperties.length > 0, `${page.id} 缺少 computed style`);
    assert.deepEqual(Object.keys(page.responsiveExpectations), ['mobile', 'tablet', 'desktop', 'wide']);
    assert.ok(page.states.includes('loading') && page.states.includes('error'));
  }
});

test('无基线页面和动态 fixture 缺口只能使用显式白名单', async () => {
  const contract = await readJson(contractUrl);
  const actualNoBaseline = contract.pages
    .filter(({ evidenceMode }) => evidenceMode === 'no-baseline')
    .map(({ id }) => id)
    .sort();
  const actualFixtureGaps = contract.pages
    .filter(({ fixture }) => fixture.status === 'required')
    .map(({ id }) => id)
    .sort();

  assert.deepEqual(actualNoBaseline, [...noBaselinePages].sort());
  assert.deepEqual(actualFixtureGaps, [...fixtureGaps].sort());
});

test('动态遮罩与宿主差异使用结构化枚举且禁止整页忽略', async () => {
  const contract = await readJson(contractUrl);

  for (const page of contract.pages) {
    for (const mask of page.dynamicMasks) {
      assert.ok(['text', 'attribute', 'element'].includes(mask.kind));
      assert.notEqual(mask.selector, 'body');
      assert.notEqual(mask.selector, 'main');
      assert.ok(!mask.selector.includes('*'), `${page.id} 使用了任意选择器遮罩`);
    }
  }
  for (const exception of contract.hostExceptions) {
    assert.ok(['font-rendering', 'native-scrollbar', 'desktop-window-frame'].includes(exception.code));
    assert.ok(exception.pages.length > 0);
  }
});
