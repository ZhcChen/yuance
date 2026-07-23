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
    style: {},
    hidden: false,
    disabled: false,
    textContent: "",
    value: "",
    classList: createClassList(),
    addEventListener() {},
    appendChild() {},
    append() {},
    replaceChildren() {},
    remove() {},
    focus() {},
    contains() {
      return false;
    },
    closest() {
      return null;
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

const currentNode = createElement("strong");
const nextNode = createElement("strong");
const modal = createElement("aside");
modal.hidden = true;
modal.matches = (selector) =>
  selector === "[data-app-update-modal]" || selector === "[data-modal]";
modal.querySelector = (selector) => {
  if (selector === "[data-app-update-current]") {
    return currentNode;
  }
  if (selector === "[data-app-update-next]") {
    return nextNode;
  }
  return null;
};
modal.querySelectorAll = () => [];

const documentElement = createElement("html");
const body = createElement("body");
const timers = [];

function schedule(callback) {
  timers.push(callback);
  return timers.length;
}

function flushTimers() {
  while (timers.length) {
    const callback = timers.shift();
    callback();
  }
}

const document = {
  documentElement,
  body,
  activeElement: null,
  fonts: { ready: Promise.resolve() },
  title: "",
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
  querySelector(selector) {
    if (selector === "[data-app-update-modal]") {
      return modal;
    }
    if (selector === "[data-modal].open") {
      return modal.classList.contains("open") ? modal : null;
    }
    if (selector === "[data-image-viewer].open") {
      return null;
    }
    return null;
  },
  querySelectorAll(selector) {
    if (selector === "[data-modal].open") {
      return modal.classList.contains("open") ? [modal] : [];
    }
    return [];
  },
};

let manifestVersion = "20260723122206";
let topbarSource = null;

class FakeEventSource {
  constructor(url, options) {
    this.url = url;
    this.options = options;
    this.listeners = new Map();
    topbarSource = this;
  }

  addEventListener(type, handler) {
    this.listeners.set(type, handler);
  }

  close() {}
}

const fetchCalls = [];

const windowObject = {
  __YUANCE_ENABLE_TEST_HOOKS__: true,
  __YUANCE_TEST_HOOKS__: {},
  __YUANCE_APP_RELEASE_VERSION__: "20260723122206",
  document,
  EventSource: FakeEventSource,
  location: {
    origin: "https://yuance.test",
    href: "https://yuance.test/web",
    pathname: "/web",
    hash: "",
    reload() {},
    assign() {},
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
    return schedule(callback);
  },
  clearTimeout() {},
  setInterval() {
    return 1;
  },
  clearInterval() {},
  requestAnimationFrame(callback) {
    return schedule(callback);
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
  fetch: async (url) => {
    fetchCalls.push(String(url));
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
        json: async () => ({ version: manifestVersion }),
      };
    }
    throw new Error(`unexpected fetch ${url}`);
  },
};
context.globalThis = context;

vm.runInNewContext(readFileSync("api/static/app.js", "utf8"), context, {
  filename: "api/static/app.js",
});

async function flushAsync() {
  await Promise.resolve();
  flushTimers();
  await Promise.resolve();
  flushTimers();
  await Promise.resolve();
}

assert.equal(typeof windowObject.__YUANCE_TEST_HOOKS__.startTopbarRealtime, "function");
assert.equal(typeof windowObject.__YUANCE_TEST_HOOKS__.checkForAppUpdate, "function");
assert.equal(typeof windowObject.__YUANCE_TEST_HOOKS__.promptAppUpdateIfNeeded, "function");
assert.equal(topbarSource?.url, "/api/v1/topbar/events");
assert.equal(topbarSource?.options?.withCredentials, true);
assert.equal(typeof topbarSource?.onopen, "function");

await flushAsync();
assert.equal(modal.hidden, true);
assert.equal(modal.classList.contains("open"), false);

topbarSource.onopen();
await flushAsync();
assert.equal(modal.hidden, true);

manifestVersion = "20260723130000";
assert.equal(
  await windowObject.__YUANCE_TEST_HOOKS__.fetchReleaseVersionManifest(),
  "20260723130000",
);
assert.equal(
  windowObject.__YUANCE_TEST_HOOKS__.promptAppUpdateIfNeeded(
    windowObject.__YUANCE_TEST_HOOKS__.currentReleaseVersion(),
    "20260723130000",
  ),
  true,
);
await flushAsync();

assert.equal(modal.hidden, false);
assert.equal(modal.classList.contains("open"), true);
assert.equal(currentNode.textContent, "20260723122206");
assert.equal(nextNode.textContent, "20260723130000");
assert(fetchCalls.includes("/version.json"));

console.log("app update sse behavior ok");
