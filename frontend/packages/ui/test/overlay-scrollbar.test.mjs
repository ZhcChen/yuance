import assert from 'node:assert/strict';
import test from 'node:test';

import { clippedRectFor } from '../src/overlay-scrollbar.jsx';

/**
 * 只实现 clippedRectFor 用到的那几个 DOM 接口，避免为了几何计算引入 jsdom。
 * @param {{ rect: [number, number, number, number], position?: string, overflow?: string, transform?: string, parent?: any, client?: [number, number] }} options
 */
function fakeElement({ rect, position = 'static', overflow = 'visible', transform = 'none', parent = null, client }) {
  const [left, top, width, height] = rect;
  const element = {
    parentElement: parent,
    ownerDocument: null,
    clientLeft: 0,
    clientTop: 0,
    clientWidth: client ? client[0] : width,
    clientHeight: client ? client[1] : height,
    style: { position, overflowX: overflow, overflowY: overflow, transform },
    getBoundingClientRect: () => ({ left, top, width, height, right: left + width, bottom: top + height }),
  };
  return element;
}

/** @param {any[]} elements */
function mount(root, elements) {
  const documentRef = { documentElement: root };
  for (const element of [root, ...elements]) element.ownerDocument = documentRef;
  return {
    innerWidth: 1280,
    innerHeight: 720,
    getComputedStyle: (/** @type {any} */ element) => element.style,
  };
}

test('a container fully inside the viewport keeps its own box', () => {
  const root = fakeElement({ rect: [0, 0, 1280, 720] });
  const main = fakeElement({ rect: [236, 60, 1044, 660], overflow: 'auto', parent: root });
  const wrap = fakeElement({ rect: [260, 200, 800, 300], overflow: 'auto', parent: main });
  const view = mount(root, [main, wrap]);

  const { rect, bottomClipped } = clippedRectFor(/** @type {any} */ (wrap), /** @type {any} */ (view));

  assert.deepEqual(rect, { top: 200, right: 1060, bottom: 500, left: 260, width: 800, height: 300 });
  assert.equal(bottomClipped, false);
});

test('a container whose lower half is scrolled out of the page reports its bottom as clipped', () => {
  const root = fakeElement({ rect: [0, 0, 1280, 720] });
  const main = fakeElement({ rect: [236, 60, 1044, 660], overflow: 'auto', parent: root });
  const wrap = fakeElement({ rect: [260, 400, 800, 700], overflow: 'auto', parent: main });
  const view = mount(root, [main, wrap]);

  const { rect, bottomClipped } = clippedRectFor(/** @type {any} */ (wrap), /** @type {any} */ (view));

  assert.equal(rect?.bottom, 720);
  assert.equal(bottomClipped, true);
});

test('an ancestor scroll area clips the container above the viewport edge', () => {
  const root = fakeElement({ rect: [0, 0, 1280, 720] });
  const main = fakeElement({ rect: [236, 60, 1044, 600], overflow: 'auto', parent: root });
  const wrap = fakeElement({ rect: [260, 40, 800, 300], overflow: 'auto', parent: main });
  const view = mount(root, [main, wrap]);

  const { rect } = clippedRectFor(/** @type {any} */ (wrap), /** @type {any} */ (view));

  assert.equal(rect?.top, 60);
  assert.equal(rect?.bottom, 340);
});

test('a container hidden entirely by an ancestor has no visible rect', () => {
  const root = fakeElement({ rect: [0, 0, 1280, 720] });
  const main = fakeElement({ rect: [236, 60, 1044, 600], overflow: 'auto', parent: root });
  const wrap = fakeElement({ rect: [260, -400, 800, 300], overflow: 'auto', parent: main });
  const view = mount(root, [main, wrap]);

  assert.equal(clippedRectFor(/** @type {any} */ (wrap), /** @type {any} */ (view)).rect, null);
});

test('absolute popups are not clipped by unpositioned scroll ancestors', () => {
  const root = fakeElement({ rect: [0, 0, 1280, 720] });
  const frame = fakeElement({ rect: [100, 100, 600, 500], position: 'relative', parent: root });
  const scroller = fakeElement({ rect: [100, 100, 600, 80], overflow: 'auto', parent: frame });
  const popup = fakeElement({ rect: [120, 120, 300, 260], position: 'absolute', overflow: 'auto', parent: scroller });
  const view = mount(root, [frame, scroller, popup]);

  const { rect, bottomClipped } = clippedRectFor(/** @type {any} */ (popup), /** @type {any} */ (view));

  assert.equal(rect?.bottom, 380);
  assert.equal(bottomClipped, false);
});

test('fixed containers ignore ancestors and only follow the viewport', () => {
  const root = fakeElement({ rect: [0, 0, 1280, 720] });
  const host = fakeElement({ rect: [300, 100, 200, 50], overflow: 'hidden', parent: root });
  const dialog = fakeElement({ rect: [340, 120, 600, 800], position: 'fixed', overflow: 'auto', parent: host });
  const view = mount(root, [host, dialog]);

  const { rect, bottomClipped } = clippedRectFor(/** @type {any} */ (dialog), /** @type {any} */ (view));

  assert.equal(rect?.bottom, 720);
  assert.equal(bottomClipped, true);
});
