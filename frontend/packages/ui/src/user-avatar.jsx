// @ts-check

import React from 'react';

export const USER_AVATAR_COLORS = [
  '#1f5fbf',
  '#2d8a68',
  '#a85b00',
  '#b42318',
  '#4656a8',
  '#0f766e',
  '#7c3aed',
  '#be4b00',
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
