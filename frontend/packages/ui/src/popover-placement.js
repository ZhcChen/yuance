// @ts-check
import { useLayoutEffect, useRef } from 'react';

/**
 * 弹出层顶层定位：通过 Popover API 把弹出层放入顶层（top layer），按锚点元素固定定位。
 * - 不受任何祖先 overflow 裁剪，也不会被模态 dialog 遮挡；DOM 位置不变，事件冒泡与样式选择器保持原样。
 * - 下方空间不足且上方更宽裕时向上展开；可用高度不足时设置 max-height，由弹出层内部滚动区收缩。
 * - 水平方向限制在视口内；页面滚动或窗口尺寸变化时重新定位。
 * - 不支持 Popover API 的环境不做任何处理，保持组件原有的定位方式。
 *
 * 弹出层元素需带 `popover="manual"` 属性，并在样式中为 `:popover-open` 设置 `position: fixed; inset: auto; margin: 0;`。
 *
 * @param {boolean} open
 * @param {{ current: HTMLElement | null }} popupRef
 * @param {{ current: HTMLElement | null }} anchorRef
 * @param {{
 *   gap?: number,
 *   margin?: number,
 *   minHeight?: number,
 *   maxHeight?: number,
 *   matchAnchorWidth?: boolean,
 *   align?: 'start' | 'end',
 *   hideDelay?: number,
 *   isOpen?: () => boolean,
 * }} [options]
 */
export function usePopoverPlacement(open, popupRef, anchorRef, options = {}) {
  const { gap = 6, margin = 8, minHeight = 96, maxHeight = Infinity, matchAnchorWidth = false, align = 'start', hideDelay = 0, isOpen } = options;
  const isOpenRef = useRef(isOpen);
  isOpenRef.current = isOpen;
  useLayoutEffect(() => {
    const popup = popupRef.current;
    const anchor = anchorRef.current;
    const view = popup?.ownerDocument?.defaultView;
    if (!open || !popup || !anchor || !view || typeof popup.showPopover !== 'function') return undefined;
    if (!popup.matches(':popover-open')) popup.showPopover();

    const place = () => {
      const rect = anchor.getBoundingClientRect();
      popup.style.maxHeight = '';
      if (matchAnchorWidth) popup.style.width = `${rect.width}px`;
      const width = popup.offsetWidth;
      const natural = Math.min(popup.scrollHeight, maxHeight);
      const below = view.innerHeight - rect.bottom - gap - margin;
      const above = rect.top - gap - margin;
      const placeAbove = natural > below && above > below;
      const available = Math.max(minHeight, Math.min(maxHeight, placeAbove ? above : below));
      const height = Math.min(natural, available);
      const preferredLeft = align === 'end' ? rect.right - width : rect.left;
      popup.style.left = `${Math.max(margin, Math.min(preferredLeft, view.innerWidth - width - margin))}px`;
      popup.style.top = `${placeAbove ? rect.top - gap - height : rect.bottom + gap}px`;
      popup.style.maxHeight = `${available}px`;
      popup.dataset.placement = placeAbove ? 'top' : 'bottom';
    };
    place();
    view.addEventListener('resize', place);
    view.addEventListener('scroll', place, true);

    const reset = () => {
      if (popup.matches(':popover-open')) popup.hidePopover();
      for (const property of ['width', 'left', 'top', 'maxHeight']) popup.style.setProperty(property.replace(/[A-Z]/gu, (letter) => `-${letter.toLowerCase()}`), '');
      delete popup.dataset.placement;
    };
    return () => {
      view.removeEventListener('resize', place);
      view.removeEventListener('scroll', place, true);
      if (!hideDelay) {
        reset();
        return;
      }
      // 等待收起动画结束后再退出顶层，避免淡出过程中回到原位置被裁剪；期间若已重新打开则保持。
      view.setTimeout(() => {
        if (isOpenRef.current?.()) return;
        reset();
      }, hideDelay);
    };
  }, [open, popupRef, anchorRef, gap, margin, minHeight, maxHeight, matchAnchorWidth, align, hideDelay]);
}
