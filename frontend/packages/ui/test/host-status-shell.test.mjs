import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { HostStatusShell } from '@yuance/frontend-ui';

test('host status shell renders product and semantic host state', () => {
  const html = renderToStaticMarkup(createElement(HostStatusShell, {
    productName: '元策',
    hostLabel: 'Desktop',
    status: 'locked',
    title: '会话已锁定',
    detail: '设备凭证暂时不可用',
  }));

  assert.match(html, /元策/);
  assert.match(html, /Desktop/);
  assert.match(html, /host-status-locked/);
  assert.match(html, /aria-live="polite"/);
});
