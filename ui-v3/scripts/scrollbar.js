/**
 * 页面级悬浮滚动条。
 *
 * 原生滚动条会占用内容宽度：有的页面需要滚动、有的不需要，切换页面时
 * 内容区宽度来回变化，界面会左右抖动。这里隐藏页面原生滚动条，
 * 改用固定定位的滑块覆盖在右侧边缘，不参与布局，宽度恒定。
 * 键盘、滚轮和触控滚动仍走浏览器原生行为。
 */

const IDLE_HIDE_MS = 1000;
const MIN_THUMB = 36;
const EDGE_GAP = 2;

export function mountPageScrollbar() {
  const root = document.documentElement;
  const track = document.createElement('div');
  track.className = 'page-scrollbar';
  track.setAttribute('aria-hidden', 'true');
  const thumb = document.createElement('div');
  thumb.className = 'page-scrollbar__thumb';
  track.appendChild(thumb);
  document.body.appendChild(track);

  let hideTimer = 0;
  let dragStartY = 0;
  let dragStartScroll = 0;

  const metrics = () => {
    const viewport = root.clientHeight;
    const total = root.scrollHeight;
    const trackHeight = viewport - EDGE_GAP * 2;
    const thumbHeight = Math.max(MIN_THUMB, (viewport / total) * trackHeight);
    const range = trackHeight - thumbHeight;
    const maxScroll = total - viewport;
    return { viewport, total, trackHeight, thumbHeight, range, maxScroll };
  };

  const wake = () => {
    track.classList.add('is-active');
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      if (!track.classList.contains('is-dragging') && !track.matches(':hover')) {
        track.classList.remove('is-active');
      }
    }, IDLE_HIDE_MS);
  };

  const update = () => {
    const m = metrics();
    const scrollable = m.maxScroll > 1;
    track.hidden = !scrollable;
    if (!scrollable) return;
    const offset = EDGE_GAP + (root.scrollTop / m.maxScroll) * m.range;
    thumb.style.height = `${m.thumbHeight}px`;
    thumb.style.transform = `translateY(${offset}px)`;
  };

  const onScroll = () => {
    update();
    wake();
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', update);
  // 路由切换会整体替换内容，高度变化不会触发 scroll，需要观察内容尺寸。
  new ResizeObserver(update).observe(document.body);
  new MutationObserver(update).observe(document.body, { childList: true, subtree: true });

  thumb.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    thumb.setPointerCapture(event.pointerId);
    dragStartY = event.clientY;
    dragStartScroll = root.scrollTop;
    track.classList.add('is-dragging', 'is-active');
  });
  thumb.addEventListener('pointermove', (event) => {
    if (!thumb.hasPointerCapture(event.pointerId)) return;
    const m = metrics();
    if (m.range <= 0) return;
    root.scrollTop = dragStartScroll + ((event.clientY - dragStartY) / m.range) * m.maxScroll;
  });
  const endDrag = (event) => {
    if (thumb.hasPointerCapture(event.pointerId)) thumb.releasePointerCapture(event.pointerId);
    track.classList.remove('is-dragging');
    wake();
  };
  thumb.addEventListener('pointerup', endDrag);
  thumb.addEventListener('pointercancel', endDrag);

  track.addEventListener('pointerdown', (event) => {
    if (event.target !== track) return;
    const m = metrics();
    const direction = event.clientY < EDGE_GAP + (root.scrollTop / m.maxScroll) * m.range ? -1 : 1;
    root.scrollBy({ top: direction * m.viewport * 0.9, behavior: 'smooth' });
  });
  track.addEventListener('pointerenter', wake);

  update();
  wake();
}
