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
    description: '请重试恢复连接。',
  }));

  assert.match(html, /元策/);
  assert.match(html, /Desktop/);
  assert.match(html, /host-status-locked/);
  assert.match(html, /设备连接进度/);
  assert.match(html, /安全连接/);
  assert.match(html, /请重试恢复连接/);
  assert.match(html, /aria-live="polite"/);
});

test('host status shell renders network context and bounded commands', () => {
  const html = renderToStaticMarkup(createElement(HostStatusShell, {
    productName: '元策', hostLabel: 'Desktop', status: 'authenticated',
    title: '设备已认证', detail: '安全连接已准备', context: '连接中断',
    primaryAction: { label: '重试', onClick() {} },
    secondaryAction: { label: '退出设备', onClick() {} },
    actionsDisabled: true,
  }));
  assert.match(html, /连接中断/);
  assert.match(html, /host-status-workspace/);
  assert.match(html, /<button[^>]*disabled=""[^>]*>重试<\/button>/);
  assert.match(html, /host-status-secondary[^>]*disabled=""[^>]*>退出设备<\/button>/);
});
