import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { USER_AVATAR_COLORS, UserAvatar, userAvatarColor, userAvatarInitial, userAvatarStyle } from '@yuance/frontend-ui';

test('user avatar hash color keeps the FNV-1a index and uses the steel palette', () => {
  assert.equal(userAvatarColor('Alice'), '#6c7a2e');
  assert.equal(userAvatarColor('张伟'), '#1d5fa8');
  assert.equal(userAvatarColor('系统管理员'), '#5a6c92');
  assert.equal(userAvatarColor('未知用户'), '#0f766e');
  assert.equal(userAvatarColor('我'), '#5a6c92');
  assert.equal(userAvatarColor('?'), '#2b6f8f');
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
  assert.deepEqual(userAvatarStyle('Alice'), { backgroundColor: '#6c7a2e', color: '#fff' });
});

test('user avatar renders shared hash attributes and inline colors', () => {
  const html = renderToStaticMarkup(createElement(UserAvatar, { name: 'Alice', className: 'custom-avatar' }));

  assert.match(html, /data-user-avatar/u);
  assert.match(html, /data-avatar-name="Alice"/u);
  assert.match(html, /class="user-avatar custom-avatar"/u);
  assert.match(html, /background-color:#6c7a2e/u);
  assert.match(html, /color:#fff/u);
  assert.match(html, />A<\/span>/u);
});

test('user avatar fallback initial and color apply when name is empty', () => {
  const html = renderToStaticMarkup(createElement(UserAvatar, { name: '', fallback: '元', className: 'nav-avatar' }));

  assert.match(html, /data-avatar-name=""/u);
  assert.match(html, /background-color:#8a6420/u);
  assert.match(html, />元<\/span>/u);
});

/** @param {string} hex */
function relativeLuminance(hex) {
  const value = Number.parseInt(hex.slice(1), 16);
  const channels = [(value >> 16) & 255, (value >> 8) & 255, value & 255].map((channel) => {
    const unit = channel / 255;
    return unit <= 0.03928 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

/** @param {string} hex */
function hueOf(hex) {
  const value = Number.parseInt(hex.slice(1), 16);
  const [r, g, b] = [(value >> 16) & 255, (value >> 8) & 255, value & 255].map((channel) => channel / 255);
  const max = Math.max(r, g, b);
  const delta = max - Math.min(r, g, b);
  if (delta === 0) return 0;
  const hue = max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  return (hue * 60 + 360) % 360;
}

test('user avatar palette keeps white initials readable and avoids purple', () => {
  assert.equal(USER_AVATAR_COLORS.length, 8);
  assert.equal(new Set(USER_AVATAR_COLORS).size, 8);
  for (const color of USER_AVATAR_COLORS) {
    const ratio = 1.05 / (relativeLuminance(color) + 0.05);
    assert.ok(ratio >= 4.5, `${color} 与白字对比度 ${ratio.toFixed(2)} 低于 4.5`);
    const hue = hueOf(color);
    assert.ok(hue < 255 || hue > 330, `${color} 色相 ${hue.toFixed(0)}° 落在紫色区间`);
  }
});
