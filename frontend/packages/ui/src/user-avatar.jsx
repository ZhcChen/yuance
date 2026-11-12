// @ts-check

import React from 'react';

/**
 * 头像底色调色盘：与钢蓝主色协调的低饱和深色，白字对比度均不低于 4.5:1。
 * 不使用紫色与高饱和红橙，避免和状态色、主色混淆。
 */
export const USER_AVATAR_COLORS = [
  '#1d5fa8',
  '#2f7d5b',
  '#8a6420',
  '#a0483f',
  '#5a6c92',
  '#0f766e',
  '#2b6f8f',
  '#6c7a2e',
];

/** @param {string | null | undefined} name */
export function userAvatarInitial(name) {
  const value = (name || '').trim();
  return value ? Array.from(value)[0].toLocaleUpperCase('zh-CN') : 'U';
}

/** @param {string | null | undefined} name */
export function userAvatarColor(name) {
  const value = (name || '').trim();
  let hash = 2166136261;
  for (const char of value) {
    hash ^= char.codePointAt(0) || 0;
    hash = Math.imul(hash, 16777619);
  }
  hash >>>= 0;
  return USER_AVATAR_COLORS[hash % USER_AVATAR_COLORS.length];
}

/** @param {string | null | undefined} name */
export function userAvatarStyle(name) {
  return { backgroundColor: userAvatarColor(name), color: '#fff' };
}

/**
 * @param {{
 *   name?: string | null,
 *   fallback?: string,
 *   className?: string,
 * }} props
 */
export function UserAvatar({ name = '', fallback = 'U', className = '' }) {
  const value = (name || fallback || '').trim();
  return (
    <span
      className={`user-avatar ${className}`.trim()}
      data-user-avatar
      data-avatar-name={name}
      style={userAvatarStyle(value)}
      aria-hidden="true"
    >
      {userAvatarInitial(value)}
    </span>
  );
}
