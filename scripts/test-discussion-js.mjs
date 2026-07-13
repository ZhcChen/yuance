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

function loadAppWithDom(options = {}) {
  const fetchCalls = [];
  const assignCalls = [];
  const sessionItems = new Map();
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
    sessionStorage: {
      getItem(key) {
        return sessionItems.get(key) || null;
      },
      setItem(key, value) {
        sessionItems.set(key, String(value));
      },
      removeItem(key) {
        sessionItems.delete(key);
      },
    },
    location: {
      origin: "https://yuance.test",
      href: "https://yuance.test/web/work-items/YCE-TASK-2",
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
    FormData: class {
      constructor(form) {
        this.values = new Map(Object.entries(form?.formData || {}));
      }

      get(name) {
        return this.values.get(name) || "";
      }

      forEach(callback) {
        this.values.forEach((value, key) => callback(value, key));
      }
    },
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
      if (typeof context.fetchOverride === "function") {
        return context.fetchOverride(url, options);
      }
      if (String(url) === "/api/v1/work-items") {
        return {
          ok: true,
          status: 201,
          json: async () => ({ data: { key: "YCE-TASK-3" } }),
        };
      }
      return {
        ok: true,
        status: 201,
        json: async () => ({ data: { id: 123 } }),
      };
    },
  };
  context.fetchOverride = options.fetch;
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
    sessionItems,
    window,
  };
}

function bugReportForm(successRedirect) {
  const status = elementStub("div");
  const title = elementStub("input");
  title.value = "项目内新建任务";

  return {
    dataset: {
      bugReportCreateUrl: "/api/v1/work-items",
      successRedirect,
      workItemLabel: "工作项",
    },
    formData: {
      project_key: "YCE",
      item_type: "task",
      title: "项目内新建任务",
      description: "从项目详情页创建",
      priority: "P2",
      assignee_username: "",
      due_date: "",
      parent_item_key: "YCE-REQ-1",
    },
    reportValidity() {
      return true;
    },
    querySelector(selector) {
      if (selector === "[data-bug-report-status]") {
        return status;
      }
      return null;
    },
    querySelectorAll(selector) {
      if (selector === "[data-bug-report-group]") {
        return [];
      }
      if (selector === "input, select, textarea, button") {
        return [title];
      }
      return [];
    },
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

function webPostForm(successMessage) {
  const submit = {
    tagName: "BUTTON",
    dataset: {},
    disabled: false,
    textContent: "提交",
  };
  return {
    action: "https://yuance.test/web/messages/read-all",
    method: "post",
    dataset: successMessage ? { successMessage } : {},
    formData: { _csrf: "token" },
    reportValidity() {
      return true;
    },
    setAttribute(name, value) {
      this[name] = String(value);
    },
    querySelector() {
      return null;
    },
    querySelectorAll(selector) {
      if (selector === "button[type='submit'], input[type='submit']") {
        return [submit];
      }
      return [];
    },
  };
}

function redirectedHtmlResponse(url) {
  return {
    ok: true,
    status: 200,
    redirected: true,
    url,
    headers: { get: () => "text/html; charset=utf-8" },
    text: async () => "",
    json: async () => ({}),
  };
}

const samePage = loadAppWithDom();
assert.equal(typeof samePage.hooks.apiErrorMessage, "function");
assert.equal(
  samePage.hooks.apiErrorMessage({ error: { message: "项目已归档，不能继续操作" } }, "默认错误"),
  "项目已归档，不能继续操作",
);
assert.equal(
  samePage.hooks.apiErrorMessage({ error: "处理人不在项目成员中" }, "默认错误"),
  "处理人不在项目成员中",
);
assert.equal(
  samePage.hooks.apiErrorMessage({ errors: [{ detail: "文件夹名称已存在" }] }, "默认错误"),
  "文件夹名称已存在",
);
assert.equal(samePage.hooks.apiErrorMessage("服务器返回文本错误", "默认错误"), "服务器返回文本错误");
assert.equal(samePage.hooks.apiErrorMessage({}, "默认错误"), "默认错误");
assert.equal(typeof samePage.hooks.submitDiscussion, "function");
await samePage.hooks.submitDiscussion(discussionForm(), submitButton());
assert.equal(samePage.fetchCalls.length, 1);
assert.equal(samePage.fetchCalls[0].url, "/api/v1/work-items/YCE-TASK-2/comments");
assert.deepEqual(JSON.parse(samePage.sessionItems.get("yuance-pending-toast")), {
  message: "内容已发表。",
  tone: "success",
});
assert.equal(samePage.window.location.hash, "comment-123");
assert.equal(samePage.reloadCount, 1);
assert.deepEqual(samePage.assignCalls, []);

const otherPage = loadAppWithDom();
otherPage.window.location.pathname = "/web/work-items/OTHER";
otherPage.hooks.reloadDiscussionAtComment("YCE-TASK-2", 456);
assert.deepEqual(otherPage.assignCalls, ["/web/work-items/YCE-TASK-2#comment-456"]);
assert.equal(otherPage.reloadCount, 0);

const projectCreate = loadAppWithDom();
assert.equal(typeof projectCreate.hooks.submitBugReport, "function");
await projectCreate.hooks.submitBugReport(bugReportForm("/web/projects/YCE?tab=work"));
assert.equal(projectCreate.fetchCalls.length, 1);
assert.equal(projectCreate.fetchCalls[0].url, "/api/v1/work-items");
assert.deepEqual(JSON.parse(projectCreate.sessionItems.get("yuance-pending-toast")), {
  message: "工作项创建完成。",
  tone: "success",
});
assert.equal(projectCreate.window.location.href, "/web/projects/YCE?tab=work");

const redirectedPost = loadAppWithDom({
  fetch: async () => redirectedHtmlResponse("https://yuance.test/web/messages?unread=true"),
});
assert.equal(typeof redirectedPost.hooks.submitWebForm, "function");
await redirectedPost.hooks.submitWebForm(webPostForm("消息已全部标为已读。"));
assert.deepEqual(redirectedPost.assignCalls, ["https://yuance.test/web/messages?unread=true"]);
assert.deepEqual(JSON.parse(redirectedPost.sessionItems.get("yuance-pending-toast")), {
  message: "消息已全部标为已读。",
  tone: "success",
});

const loginRedirect = loadAppWithDom({
  fetch: async () => redirectedHtmlResponse("https://yuance.test/web/login"),
});
await loginRedirect.hooks.submitWebForm(webPostForm("不应出现"));
assert.deepEqual(loginRedirect.assignCalls, ["https://yuance.test/web/login"]);
assert.equal(loginRedirect.sessionItems.has("yuance-pending-toast"), false);

const nonWebRedirect = loadAppWithDom({
  fetch: async () => redirectedHtmlResponse("https://yuance.test/webhook"),
});
await nonWebRedirect.hooks.submitWebForm(webPostForm("不应出现"));
assert.deepEqual(nonWebRedirect.assignCalls, ["https://yuance.test/webhook"]);
assert.equal(nonWebRedirect.sessionItems.has("yuance-pending-toast"), false);

console.log("discussion js behavior ok");
