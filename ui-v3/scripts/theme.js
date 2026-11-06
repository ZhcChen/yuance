/*
 * 元策 UI v3 · 主题
 * ------------------------------------------------------------------
 * 暗色主题的取值来自生产包的 tokens.css（html[data-theme="dark"]），
 * 原型只负责标记文档根节点与记住选择，不单独维护一套颜色。
 */

const STORAGE_KEY = 'yuance-theme';

/** @returns {'light' | 'dark'} */
export function readTheme() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

/** @param {'light' | 'dark'} theme */
export function writeTheme(theme) {
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // 隐私模式下写入失败时忽略，主题仍然生效。
  }
}

/** 切换主题并返回新的主题。 @returns {'light' | 'dark'} */
export function toggleTheme() {
  const next = readTheme() === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  writeTheme(next);
  return next;
}
