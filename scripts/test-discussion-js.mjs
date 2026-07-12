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
    files: [],
    addEventListener() {},
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    append(...children) {
      this.children.push(...children);
    },
    after() {},
    before() {},
    remove() {},
    setAttribute(name, value) {
      this[name] = String(value);
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
    contains() {
      return false;
    },
    focus() {},
    scrollIntoView() {},
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
  };
}

function loadAppWithDom() {
  const fetchCalls = [];
  const assignCalls = [];
  let reloadCount = 0;

  const documentElement = elementStub("html");
  const body = elementStub("body");
  const document = {
    documentElement,
    body,
    activeElement: null,
    fonts: { ready: Promise.resolve() },
    addEventListener() {},
    contains() {
      return true;
    },
    createElement: (tagName) => elementStub(tagName),
    createElementNS: (_namespace, tagName) => elementStub(tagName),
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

  const window = {
    __YUANCE_ENABLE_TEST_HOOKS__: true,
    __YUANCE_TEST_HOOKS__: {},
    document,
    localStorage: {
      getItem() {
        return null;
      },
      setItem() {},
      removeItem() {},
    },
    location: {
      pathname: "/web/work-items/YCE-TASK-2",
      hash: "",
      assign(url) {
        assignCalls.push(url);
      },
      reload() {
        reloadCount += 1;
      },
    },
    addEventListener() {},
    clearTimeout() {},
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
  };

  const context = {
    console,
    document,
    window,
    URL,
    URLSearchParams,
    FormData,
    Headers,
    MutationObserver: class {
      observe() {}
      disconnect() {}
    },
    ResizeObserver: class {
      observe() {}
      disconnect() {}
    },
    fetch: async (url, options) => {
      fetchCalls.push({ url, options });
      return {
        ok: true,
        status: 201,
        json: async () => ({ data: { id: 123 } }),
      };
    },
  };
  context.globalThis = context;

  vm.runInNewContext(readFileSync("api/static/app.js", "utf8"), context, {
    filename: "api/static/app.js",
  });

  return {
    assignCalls,
    fetchCalls,
    get reloadCount() {
      return reloadCount;
    },
    hooks: window.__YUANCE_TEST_HOOKS__,
    window,
  };
}

function submitButton() {
  return {
    dataset: {},
    disabled: false,
    textContent: "发表",
    matches(selector) {
      return selector === "[data-discussion-submit]";
    },
  };
}

function discussionForm() {
  const status = elementStub("div");
  const bodyInput = {
    dataset: {},
    disabled: false,
    value: "这里是前端行为测试评论",
    matches(selector) {
      return selector === "[data-discussion-body]";
    },
  };
  const parentInput = {
    dataset: {},
    disabled: false,
    value: "",
    matches() {
      return false;
    },
  };
  const submit = submitButton();
  const controls = [bodyInput, parentInput, submit];

  return {
    dataset: { itemKey: "YCE-TASK-2" },
    bugReportFiles: [],
    reportValidity() {
      return true;
    },
    querySelector(selector) {
      if (selector === "[data-discussion-body]") {
        return bodyInput;
      }
      if (selector === "input[name='parent_comment_id']") {
        return parentInput;
      }
      if (selector === "[data-discussion-submit]") {
        return submit;
      }
      if (selector === "[data-discussion-status]") {
        return status;
      }
      return null;
    },
    querySelectorAll(selector) {
      if (selector === "button, textarea, input, select") {
        return controls;
      }
      if (selector === "[data-discussion-submit]") {
        return [submit];
      }
      return [];
    },
  };
}

const samePage = loadAppWithDom();
assert.equal(typeof samePage.hooks.submitDiscussion, "function");
await samePage.hooks.submitDiscussion(discussionForm(), submitButton());
assert.equal(samePage.fetchCalls.length, 1);
assert.equal(samePage.fetchCalls[0].url, "/api/v1/work-items/YCE-TASK-2/comments");
assert.equal(samePage.window.location.hash, "comment-123");
assert.equal(samePage.reloadCount, 1);
assert.deepEqual(samePage.assignCalls, []);

const otherPage = loadAppWithDom();
otherPage.window.location.pathname = "/web/work-items/OTHER";
otherPage.hooks.reloadDiscussionAtComment("YCE-TASK-2", 456);
assert.deepEqual(otherPage.assignCalls, ["/web/work-items/YCE-TASK-2#comment-456"]);
assert.equal(otherPage.reloadCount, 0);

console.log("discussion js behavior ok");
