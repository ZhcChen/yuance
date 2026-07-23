import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

function createClassList() {
  const values = new Set();
  return {
    add(...items) {
      items.forEach((item) => values.add(item));
    },
    remove(...items) {
      items.forEach((item) => values.delete(item));
    },
    contains(item) {
      return values.has(item);
    },
    toggle(item, force) {
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

function createElement(tagName = "div") {
  const attributes = new Map();
  return {
    tagName: tagName.toUpperCase(),
    dataset: {},
    hidden: false,
    disabled: false,
    textContent: "",
    classList: createClassList(),
    style: {},
    addEventListener() {},
    append() {},
    appendChild() {},
    replaceChildren() {},
    remove() {},
    focus() {},
    closest() {
      return null;
    },
    contains() {
      return false;
    },
    matches() {
      return false;
    },
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
    setAttribute(name, value) {
      attributes.set(name, String(value));
    },
    getAttribute(name) {
      return attributes.has(name) ? attributes.get(name) : "";
    },
    removeAttribute(name) {
      attributes.delete(name);
    },
    hasAttribute(name) {
      return attributes.has(name);
    },
  };
}

const triggerBadge = createElement("span");
const currentName = createElement("span");
const yceBadge = createElement("span");
const opsBadge = createElement("span");

function createProjectOption(projectKey, badge) {
  return {
    classList: createClassList(),
    dataset: {},
    getAttribute(name) {
      if (name === "data-project-key") {
        return projectKey;
      }
      return "";
    },
    querySelector(selector) {
      if (selector === "[data-project-option-badge]") {
        return badge;
      }
      return null;
    },
  };
}

const projectOptions = [
  createProjectOption("YCE", yceBadge),
  createProjectOption("OPS", opsBadge),
];

const switcher = createElement("form");
switcher.matches = (selector) => selector === "[data-project-switcher]";
switcher.querySelector = (selector) => {
  if (selector === ".project-switcher-current") {
    return currentName;
  }
  if (selector === "[data-current-project-badge]") {
    return triggerBadge;
  }
  return null;
};
switcher.querySelectorAll = (selector) => {
  if (selector === "[data-project-option]") {
    return projectOptions;
  }
  return [];
};

const topbarProjectLink = createElement("a");

const document = {
  documentElement: createElement("html"),
  body: createElement("body"),
  activeElement: null,
  fonts: { ready: Promise.resolve() },
  addEventListener() {},
  contains() {
    return true;
  },
  createElement(tagName) {
    return createElement(tagName);
  },
  createElementNS(_ns, tagName) {
    return createElement(tagName);
  },
  getElementById() {
    return null;
  },
  querySelector() {
    return null;
  },
  querySelectorAll(selector) {
    if (selector === "[data-project-switcher]") {
      return [switcher];
    }
    if (selector === "[data-topbar-project-link]") {
      return [topbarProjectLink];
    }
    return [];
  },
};

const windowObject = {
  __YUANCE_ENABLE_TEST_HOOKS__: true,
  __YUANCE_TEST_HOOKS__: {},
  __YUANCE_APP_RELEASE_VERSION__: "20260723124323",
  document,
  location: {
    origin: "https://yuance.test",
    href: "https://yuance.test/web/projects/YCE",
    pathname: "/web/projects/YCE",
    search: "",
    hash: "",
  },
  localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
  sessionStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
  matchMedia() {
    return { matches: false, addEventListener() {}, removeEventListener() {} };
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
  addEventListener() {},
  setTimeout(callback) {
    callback();
    return 1;
  },
  clearTimeout() {},
  setInterval() {
    return 1;
  },
  clearInterval() {},
  requestAnimationFrame(callback) {
    callback();
    return 1;
  },
  cancelAnimationFrame() {},
  history: { replaceState() {}, pushState() {} },
};

const context = {
  console,
  window: windowObject,
  document,
  URL,
  URLSearchParams,
  Headers,
  FormData: class {
    constructor() {}
    get() {
      return "";
    }
    forEach() {}
  },
  MutationObserver: class { observe() {} disconnect() {} },
  ResizeObserver: class { observe() {} disconnect() {} },
  DOMParser: class {
    parseFromString() {
      return { title: "", querySelector() { return null; } };
    }
  },
  EventSource: class {
    constructor() {}
    addEventListener() {}
    close() {}
  },
  fetch: async (url) => {
    if (String(url) === "/api/v1/topbar/status") {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            requirements_count: 0,
            tasks_count: 0,
            bugs_count: 0,
            notifications_count: 0,
            project_badges: [],
            current_project: null,
          },
        }),
      };
    }
    if (String(url) === "/version.json") {
      return {
        ok: true,
        status: 200,
        json: async () => ({ version: "20260723124323" }),
      };
    }
    throw new Error(`unexpected fetch ${url}`);
  },
};
context.globalThis = context;

vm.runInNewContext(readFileSync("api/static/app.js", "utf8"), context, {
  filename: "api/static/app.js",
});

windowObject.__YUANCE_TEST_HOOKS__.renderTopbarStatus({
  requirements_count: 0,
  tasks_count: 2,
  bugs_count: 0,
  notifications_count: 0,
  project_badges: [
    { project_key: "YCE", pending_count: 2 },
    { project_key: "OPS", pending_count: 1 },
  ],
  current_project: {
    key: "YCE",
    name: "卡券系统",
    pending_count: 2,
  },
});

assert.equal(triggerBadge.textContent, "3");
assert.equal(triggerBadge.hidden, false);
assert.equal(triggerBadge.getAttribute("aria-label"), "全部项目待处理 3");
assert.equal(currentName.textContent, "卡券系统");
assert.equal(topbarProjectLink.href, "/web/projects/YCE");
assert.equal(yceBadge.textContent, "2");
assert.equal(yceBadge.getAttribute("aria-label"), "待处理 2");
assert.equal(opsBadge.textContent, "1");
assert.equal(opsBadge.getAttribute("aria-label"), "待处理 1");

console.log("project switcher total badge ok");
