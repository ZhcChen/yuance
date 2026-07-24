import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

function classList() {
  const values = new Set();
  return {
    add: (...items) => items.forEach((item) => values.add(item)),
    remove: (...items) => items.forEach((item) => values.delete(item)),
    contains: (item) => values.has(item),
    toggle: (item, force) => {
      const shouldAdd = force === undefined ? !values.has(item) : Boolean(force);
      if (shouldAdd) {
        values.add(item);
      } else {
        values.delete(item);
      }
      return shouldAdd;
    },
  };
}

function elementStub(tagName = "div") {
  return {
    tagName: tagName.toUpperCase(),
    dataset: {},
    style: {},
    classList: classList(),
    children: [],
    hidden: false,
    disabled: false,
    textContent: "",
    value: "",
    addEventListener() {},
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    append(...children) {
      this.children.push(...children);
    },
    remove() {},
    setAttribute(name, value) {
      this[name] = String(value);
    },
    removeAttribute(name) {
      delete this[name];
    },
    getAttribute() {
      return "";
    },
    hasAttribute() {
      return false;
    },
    matches() {
      return false;
    },
    closest() {
      return null;
    },
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
    focus() {},
  };
}

function loadApp(options = {}) {
  const clickedBlankUrls = [];
  const openedUrls = [];

  const body = elementStub("body");
  const document = {
    body,
    documentElement: elementStub("html"),
    fonts: { ready: Promise.resolve() },
    activeElement: null,
    addEventListener() {},
    contains() {
      return true;
    },
    createElement(tagName) {
      const element = elementStub(tagName);
      if (String(tagName).toLowerCase() === "a") {
        element.click = () => {
          clickedBlankUrls.push({
            href: element.href || "",
            target: element.target || "",
            rel: element.rel || "",
          });
          if (typeof options.anchorClick === "function") {
            options.anchorClick(element);
          }
        };
      }
      return element;
    },
    createElementNS(_namespace, tagName) {
      return elementStub(tagName);
    },
    getElementById() {
      return null;
    },
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
  };

  const location = {
    origin: "https://yuance.test",
    href: "https://yuance.test/web/work-items/YCE-TASK-2",
    pathname: "/web/work-items/YCE-TASK-2",
    hash: "",
    assign(url) {
      this.href = String(url);
    },
    reload() {},
  };

  const windowObject = {
    __YUANCE_ENABLE_TEST_HOOKS__: true,
    __YUANCE_TEST_HOOKS__: {},
    document,
    location,
    localStorage: {
      getItem() {
        return null;
      },
      setItem() {},
      removeItem() {},
    },
    sessionStorage: {
      getItem() {
        return null;
      },
      setItem() {},
      removeItem() {},
    },
    addEventListener() {},
    clearTimeout() {},
    clearInterval() {},
    setInterval() {
      return 1;
    },
    setTimeout(callback) {
      callback();
      return 1;
    },
    requestAnimationFrame(callback) {
      callback();
      return 1;
    },
    cancelAnimationFrame() {},
    matchMedia() {
      return {
        matches: false,
        addEventListener() {},
        removeEventListener() {},
      };
    },
    getComputedStyle() {
      return {
        font: "",
        fontFamily: "sans-serif",
        fontSize: "13px",
        fontStyle: "normal",
        fontVariant: "normal",
        fontWeight: "400",
      };
    },
    open(url) {
      openedUrls.push(String(url));
      if (typeof options.windowOpen === "function") {
        return options.windowOpen(url);
      }
      return {};
    },
  };

  const context = {
    console,
    document,
    window: windowObject,
    URL,
    URLSearchParams,
    Headers,
    FormData: class {
      constructor() {
        this.values = new Map();
      }
      get(name) {
        return this.values.get(name) || "";
      }
      forEach(callback) {
        this.values.forEach((value, key) => callback(value, key));
      }
    },
    MutationObserver: class {
      observe() {}
      disconnect() {}
    },
    ResizeObserver: class {
      observe() {}
      disconnect() {}
    },
    fetch: async () => ({
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      json: async () => ({}),
      text: async () => "",
    }),
  };

  context.globalThis = context;

  vm.runInNewContext(readFileSync("api/static/app.js", "utf8"), context, {
    filename: "api/static/app.js",
  });

  return {
    clickedBlankUrls,
    hooks: windowObject.__YUANCE_TEST_HOOKS__,
    location,
    openedUrls,
    window: windowObject,
  };
}

const successPage = loadApp();
assert.equal(typeof successPage.hooks.openDocumentPreviewWindow, "function");
assert.equal(
  successPage.hooks.openDocumentPreviewWindow("/web/work-items/YCE-TASK-2/attachments/12/preview"),
  true,
);
assert.deepEqual(successPage.clickedBlankUrls, [
  {
    href: "/web/work-items/YCE-TASK-2/attachments/12/preview",
    target: "_blank",
    rel: "noopener noreferrer",
  },
]);
assert.deepEqual(successPage.openedUrls, []);
assert.equal(successPage.location.href, "https://yuance.test/web/work-items/YCE-TASK-2");

const blockedPage = loadApp({
  anchorClick() {
    throw new Error("blocked");
  },
  windowOpen() {
    return null;
  },
});
assert.equal(
  blockedPage.hooks.openDocumentPreviewWindow("/web/projects/YCE/attachments/55/preview"),
  false,
);
assert.equal(blockedPage.location.href, "https://yuance.test/web/work-items/YCE-TASK-2");
assert.deepEqual(blockedPage.openedUrls, ["/web/projects/YCE/attachments/55/preview"]);
