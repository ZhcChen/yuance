import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { UserAvatar, userAvatarColor, userAvatarInitial, userAvatarStyle } from '@yuance/frontend-ui';

test('user avatar hash color matches the legacy FNV-1a palette', () => {
  assert.equal(userAvatarColor('Alice'), '#be4b00');
  assert.equal(userAvatarColor('张伟'), '#1f5fbf');
  assert.equal(userAvatarColor('系统管理员'), '#4656a8');
  assert.equal(userAvatarColor('未知用户'), '#0f766e');
  assert.equal(userAvatarColor('我'), '#4656a8');
  assert.equal(userAvatarColor('?'), '#7c3aed');
  assert.equal(userAvatarColor(''), '#0f766e');
});

test('user avatar initial keeps the first CJK or Latin character', () => {
  assert.equal(userAvatarInitial('Alice'), 'A');
  assert.equal(userAvatarInitial('张伟'), '张');
  assert.equal(userAvatarInitial('  alice  '), 'A');
  assert.equal(userAvatarInitial(''), 'U');
  assert.equal(userAvatarInitial(null), 'U');
});

test('user avatar style always uses white text', () => {
  assert.deepEqual(userAvatarStyle('Alice'), { backgroundColor: '#be4b00', color: '#fff' });
});

test('user avatar renders shared hash attributes and inline colors', () => {
  const html = renderToStaticMarkup(createElement(UserAvatar, { name: 'Alice', className: 'custom-avatar' }));

  assert.match(html, /data-user-avatar/u);
  assert.match(html, /data-avatar-name="Alice"/u);
  assert.match(html, /class="user-avatar custom-avatar"/u);
  assert.match(html, /background-color:#be4b00/u);
  assert.match(html, /color:#fff/u);
  assert.match(html, />A<\/span>/u);
});

test('user avatar fallback initial and color apply when name is empty', () => {
  const html = renderToStaticMarkup(createElement(UserAvatar, { name: '', fallback: '元', className: 'nav-avatar' }));

  assert.match(html, /data-avatar-name=""/u);
  assert.match(html, /background-color:#a85b00/u);
  assert.match(html, />元<\/span>/u);
});
