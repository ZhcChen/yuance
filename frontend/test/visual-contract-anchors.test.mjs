import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/*
 * 视觉合同锚点存在性校验。
 *
 * 背景：主 Web 视觉合同（frontend/parity/main-web-visual-contract.json）登记了每个页面的
 * `stableAnchors` 与 `geometryAnchors`，但既有校验全部是静态结构校验，没有任何检查确认这些
 * 选择器在真实实现中还存在。UI 回迁会重写 DOM（换壳层、换页面结构），一旦锚点被改名或删除，
 * 合同会静默失效——这正是本测试要拦截的回归。
 *
 * 校验对象是「当前真正提供该路由的实现」，不是历史基线：
 * - React 生产实现（浏览器端与桌面端共用同一套 SharedApp）；
 * - 仍由服务端渲染的边界页模板与静态样式（登录、初始化、设备授权、下载页、API 文档）。
 * legacy 服务端模板已在正式 Web 切换中退役，因此历史基线里的类名对不上时，
 * 应当修正合同而不是放宽校验。
 */

const contractUrl = new URL('../parity/main-web-visual-contract.json', import.meta.url);
const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));

/** 实现源码范围：相对仓库根。 */
const implementationRoots = [
  'frontend/packages/app-shell/src',
  'frontend/packages/ui/src',
  'api/templates',
  'api/static',
  'api/src/web',
  'web/src',
];

/** 单文件来源：相对仓库根。 */
const implementationFiles = ['web/index.html'];

/** 可被解析为 DOM 结构的源码扩展名。 */
const sourceExtensions = new Set(['.jsx', '.js', '.css', '.html', '.rs', '.mjs']);

const classAttributePattern = /class(?:Name)?\s*=\s*(?:"([^"]*)"|'([^']*)'|\{`([^`]*)`\}|\{([^}]*)\})/g;
const cssClassPattern = /\.([A-Za-z_][\w-]*)/g;
const idAttributePattern = /\bid\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
const tagPattern = /<([A-Za-z][\w-]*)/g;
const attributePattern = /\b([A-Za-z][\w-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

function splitClassTokens(value) {
  return value
    .split(/[\s${}'"`]+/)
    .map((token) => token.trim())
    .filter((token) => /^[A-Za-z][\w-]*$/.test(token));
}

/**
 * 把选择器拆成必须能在实现里找到的片段。
 * 支持 `.class`、`#id`、`tag`、`tag[attr=value]` 四种写法。
 */
export function parseAnchorTokens(selector) {
  const tokens = [];
  const pattern = /#[\w-]+|\.[\w-]+|\[[^\]]+\]|[A-Za-z][\w-]*/g;
  let match = pattern.exec(selector);
  while (match) {
    const raw = match[0];
    if (raw.startsWith('#')) {
      tokens.push({ kind: 'id', value: raw.slice(1) });
    } else if (raw.startsWith('.')) {
      tokens.push({ kind: 'class', value: raw.slice(1) });
    } else if (raw.startsWith('[')) {
      const inner = raw.slice(1, -1);
      const separator = inner.indexOf('=');
      if (separator === -1) {
        tokens.push({ kind: 'attribute', name: inner, value: null });
      } else {
        tokens.push({
          kind: 'attribute',
          name: inner.slice(0, separator).trim(),
          value: inner.slice(separator + 1).trim().replace(/^["']|["']$/g, ''),
        });
      }
    } else {
      tokens.push({ kind: 'tag', value: raw });
    }
    match = pattern.exec(selector);
  }
  return tokens;
}

async function collectSourceFiles(relativePath) {
  const absolute = path.join(repositoryRoot, relativePath);
  const info = await stat(absolute);
  if (info.isFile()) return [absolute];
  const entries = await readdir(absolute, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const nested = await collectSourceFiles(path.join(relativePath, entry.name));
    files.push(...nested);
  }
  return files;
}

async function loadImplementationSources() {
  const files = [];
  for (const root of implementationRoots) {
    files.push(...(await collectSourceFiles(root)));
  }
  for (const file of implementationFiles) {
    files.push(path.join(repositoryRoot, file));
  }
  const sources = [];
  for (const file of files) {
    if (!sourceExtensions.has(path.extname(file))) continue;
    sources.push({ file: path.relative(repositoryRoot, file), text: await readFile(file, 'utf8') });
  }
  return sources;
}

function buildIndex(sources) {
  const classes = new Map();
  const cssClasses = new Map();
  const ids = new Map();
  const tags = new Map();
  const attributes = new Map();

  const register = (index, key, file) => {
    if (!index.has(key)) index.set(key, new Set());
    index.get(key).add(file);
  };

  for (const { file, text } of sources) {
    let match = classAttributePattern.exec(text);
    while (match) {
      const raw = [match[1], match[2], match[3], match[4]].filter(Boolean).join(' ');
      for (const token of splitClassTokens(raw)) register(classes, token, file);
      match = classAttributePattern.exec(text);
    }
    classAttributePattern.lastIndex = 0;

    if (path.extname(file) === '.css') {
      // 样式表里出现同名规则不代表锚点仍在 DOM 上：只有挂到元素上的类名才算锚点存在。
      let cssMatch = cssClassPattern.exec(text);
      while (cssMatch) {
        register(cssClasses, cssMatch[1], file);
        cssMatch = cssClassPattern.exec(text);
      }
      cssClassPattern.lastIndex = 0;
    }

    let idMatch = idAttributePattern.exec(text);
    while (idMatch) {
      register(ids, idMatch[1] || idMatch[2], file);
      idMatch = idAttributePattern.exec(text);
    }
    idAttributePattern.lastIndex = 0;

    let tagMatch = tagPattern.exec(text);
    while (tagMatch) {
      register(tags, tagMatch[1].toLowerCase(), file);
      tagMatch = tagPattern.exec(text);
    }
    tagPattern.lastIndex = 0;

    let attributeMatch = attributePattern.exec(text);
    while (attributeMatch) {
      register(attributes, `${attributeMatch[1].toLowerCase()}=${attributeMatch[2] ?? attributeMatch[3]}`, file);
      attributeMatch = attributePattern.exec(text);
    }
    attributePattern.lastIndex = 0;
  }

  return { classes, cssClasses, ids, tags, attributes };
}

function resolveToken(token, index) {
  if (token.kind === 'id') return index.ids.has(token.value) ? index.ids.get(token.value) : null;
  if (token.kind === 'class') return index.classes.has(token.value) ? index.classes.get(token.value) : null;
  if (token.kind === 'tag') {
    const value = token.value.toLowerCase();
    return index.tags.has(value) ? index.tags.get(value) : null;
  }
  const key = `${token.name.toLowerCase()}=${token.value ?? ''}`;
  return index.attributes.has(key) ? index.attributes.get(key) : null;
}

async function readContract() {
  return JSON.parse(await readFile(contractUrl, 'utf8'));
}

test('实现源码范围可解析且包含 React 共享应用', async () => {
  const sources = await loadImplementationSources();

  assert.ok(sources.length > 0, '实现源码范围为空，锚点校验会假阳性通过');
  assert.ok(
    sources.some(({ file }) => file === 'frontend/packages/app-shell/src/app.jsx'),
    '实现源码范围必须包含 React 共享应用入口，否则锚点校验失去意义',
  );
});

test('视觉合同每个页面的稳定锚点与几何锚点都能在实现中找到', async () => {
  const [contract, sources] = await Promise.all([readContract(), loadImplementationSources()]);
  const index = buildIndex(sources);
  const failures = [];

  for (const page of contract.pages) {
    for (const field of ['stableAnchors', 'geometryAnchors']) {
      for (const selector of page[field] ?? []) {
        for (const token of parseAnchorTokens(selector)) {
          const matched = resolveToken(token, index);
          if (!matched) {
            failures.push(`${page.id} ${field} 选择器 "${selector}" 中的 ${token.kind} "${token.value}" 在实现中不存在`);
          }
        }
      }
    }
  }

  assert.deepEqual(failures, [], `视觉合同锚点失效：\n${failures.join('\n')}`);
});

test('视觉合同登记的锚点没有重复或空值', async () => {
  const contract = await readContract();

  for (const page of contract.pages) {
    for (const field of ['stableAnchors', 'geometryAnchors']) {
      const selectors = page[field] ?? [];
      assert.equal(new Set(selectors).size, selectors.length, `${page.id} ${field} 存在重复锚点`);
      for (const selector of selectors) {
        assert.ok(selector.trim().length > 0, `${page.id} ${field} 存在空锚点`);
        assert.ok(parseAnchorTokens(selector).length > 0, `${page.id} ${field} 的 "${selector}" 无法解析出锚点片段`);
      }
    }
  }
});
