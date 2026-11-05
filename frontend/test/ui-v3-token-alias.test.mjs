import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

const prototypeStyles = new URL('../../ui-v3/styles/', import.meta.url);

/**
 * 原型的样式只允许使用别名层里声明过的短名。
 * 别名层再指向生产包的规范令牌，任何一层断链都会让原型与生产取值不一致，
 * 而这种偏差在浏览器里只会表现为"某个属性没生效"，很难被察觉。
 */
test('原型样式的每个变量引用都能在别名层解析', async () => {
  const tokenSource = await readFile(new URL('tokens.css', prototypeStyles), 'utf8');
  const defined = new Set([...tokenSource.matchAll(/(--[a-zA-Z0-9-]+)\s*:/gu)].map((match) => match[1]));

  const entries = await readdir(prototypeStyles, { withFileTypes: true });
  const missing = new Set();
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.css') || entry.name === 'tokens.css') continue;
    const source = await readFile(new URL(entry.name, prototypeStyles), 'utf8');
    for (const match of source.matchAll(/var\((--[a-zA-Z0-9-]+)(\s*,|\s*\))/gu)) {
      // 带兜底值的引用视为已解析
      if (match[2].trim() === ',') continue;
      if (!defined.has(match[1])) missing.add(match[1]);
    }
  }

  assert.deepEqual([...missing].sort(), [], '原型样式引用了别名层未声明的变量');
});
