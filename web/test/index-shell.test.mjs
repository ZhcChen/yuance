import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const indexHtml = await readFile(new URL('../index.html', import.meta.url), 'utf8');

test('Web 入口使用与服务端页面一致的元策品牌图标', () => {
  assert.match(indexHtml, /<link rel="icon" href="\/favicon\.ico" type="image\/svg\+xml" \/>/u);
  assert.match(indexHtml, /<link rel="alternate icon" href="\/static\/brand\/yuance-logo\.svg" type="image\/svg\+xml" \/>/u);
});
