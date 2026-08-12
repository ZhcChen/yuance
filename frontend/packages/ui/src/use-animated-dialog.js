// @ts-check
/* global setTimeout, clearTimeout */

import { useEffect, useRef } from 'react';

const DEFAULT_EXIT_MS = 180;

/**
 * 让原生 dialog 的关闭延迟到退出动画结束后再 close()，
 * 否则 close() 会立即移除 open 状态，关闭动画无法播放。
 *
 * @param {boolean} open
 * @param {import('react').RefObject<HTMLDialogElement | null>} dialogRef
 * @param {string} closingClass
 * @param {number} [exitMs]
 */
export function useAnimatedDialog(open, dialogRef, closingClass, exitMs = DEFAULT_EXIT_MS) {
  const timerRef = useRef(/** @type {ReturnType<typeof setTimeout> | null} */ (null));

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return undefined;
    }
    if (open) {
      dialog.classList.remove(closingClass);
      if (!dialog.open) {
        dialog.showModal();
      }
      return undefined;
    }
    if (!dialog.open || dialog.classList.contains(closingClass)) {
      return undefined;
    }

    const view = dialog.ownerDocument.defaultView;
    const reducedMotion = Boolean(
      view && typeof view.matchMedia === 'function' && view.matchMedia('(prefers-reduced-motion: reduce)').matches,
    );
    dialog.classList.add(closingClass);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      dialog.classList.remove(closingClass);
      if (dialog.open) {
        dialog.close();
      }
    }, reducedMotion ? 0 : exitMs);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [open, dialogRef, closingClass, exitMs]);
}
