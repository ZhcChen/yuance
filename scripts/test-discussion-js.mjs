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
    createElement: (tagName) => {
      const element = elementStub(tagName);
      if (String(tagName).toLowerCase() === "canvas" && options.canvasMeasureText) {
        const canvasContext = {
          font: "",
          measureText(text) {
            return { width: options.canvasMeasureText(String(text), this.font) };
          },
        };
        element.getContext = () => canvasContext;
      }
      return element;
    },
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
    getComputedStyle() {
      return {
        font: options.computedFont || "",
        fontFamily: "sans-serif",
        fontSize: "13px",
        fontStyle: "normal",
        fontVariant: "normal",
        fontWeight: "400",
      };
    },
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

function richDiscussionForm(uploadState) {
  const status = elementStub("div");
  const bodyInput = {
    dataset: {},
    disabled: false,
    value: "",
    matches(selector) {
      return selector === "[data-discussion-body]";
    },
  };
  const formatInput = { value: "" };
  const richInput = {
    innerHTML: "<p>保留正文</p>",
    focus() {},
    cloneNode() {
      return {
        innerHTML: this.innerHTML,
        querySelectorAll() {
          return [];
        },
      };
    },
  };
  const attachment = uploadState ? { dataset: { uploadState } } : null;
  const editor = {
    querySelector(selector) {
      if (selector === "[data-rich-text-input]") {
        return richInput;
      }
      if (selector === "[data-rich-attachment][data-upload-state='uploading']") {
        return uploadState === "uploading" ? attachment : null;
      }
      if (selector === "[data-rich-attachment][data-upload-state='error']") {
        return uploadState === "error" ? attachment : null;
      }
      return null;
    },
  };
  const form = {
    dataset: { itemKey: "YCE-TASK-2" },
    querySelector(selector) {
      if (selector === "[data-rich-text-editor]") {
        return editor;
      }
      if (selector === "[data-discussion-body]") {
        return bodyInput;
      }
      if (selector === "[data-discussion-body-format]") {
        return formatInput;
      }
      if (selector === "[data-discussion-status]") {
        return status;
      }
      return null;
    },
  };
  return { bodyInput, formatInput, form, status };
}

function webPostForm(successMessage, options = {}) {
  const submit = {
    tagName: options.submitTagName || "BUTTON",
    dataset: {},
    disabled: false,
    textContent: options.buttonText || "提交",
    value: options.buttonValue || "",
    getAttribute(name) {
      if (name === "aria-label") {
        return options.ariaLabel || "";
      }
      return "";
    },
  };
  return {
    action: "https://yuance.test/web/messages/read-all",
    method: "post",
    dataset: {
      ...(successMessage ? { successMessage } : {}),
      ...(options.confirmAction ? { confirmAction: options.confirmAction } : {}),
    },
    formData: { _csrf: "token" },
    reportValidity() {
      return true;
    },
    setAttribute(name, value) {
      this[name] = String(value);
    },
    querySelector(selector) {
      if (selector === "button[type='submit'], input[type='submit']") {
        return submit;
      }
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
assert.equal(typeof samePage.hooks.filterSelectOptions, "function");
assert.equal(typeof samePage.hooks.selectPanelTargetWidth, "function");
const shortSelectPanel = {
  querySelectorAll: () => [{ textContent: "待处理", disabled: false }],
  querySelector: () => null,
};
const longSelectPanel = {
  querySelectorAll: () => [
    { textContent: "待处理", disabled: false },
    { textContent: "指派给非常非常长的成员名称 @longusername", disabled: false },
  ],
  querySelector: () => null,
};
const wideLatinSelectPanel = {
  querySelectorAll: () => [{ textContent: "WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW", disabled: false }],
  querySelector: () => null,
};
const disabledLongSelectPanel = {
  querySelectorAll: () => [
    { textContent: "待处理", disabled: false },
    { textContent: "禁用但非常非常长的历史状态选项 @disabled-long-value", disabled: true },
  ],
  querySelector: () => null,
};
const searchableSelectPanel = {
  querySelectorAll: () => [{ textContent: "项目成员", disabled: false }],
  querySelector: (selector) => selector === "[data-select-search]"
    ? { placeholder: "搜索非常非常长非常非常长的父需求标题或处理人名称" }
    : null,
};
assert.equal(
  samePage.hooks.selectPanelTargetWidth(
    { selectElement: { dataset: {} }, selectPanel: shortSelectPanel },
    120,
    1024,
  ),
  168,
);
assert.equal(
  samePage.hooks.selectPanelTargetWidth(
    { selectElement: { dataset: {} }, selectPanel: shortSelectPanel },
    240,
    1024,
  ),
  240,
);
assert.equal(
  samePage.hooks.selectPanelTargetWidth(
    { selectElement: { dataset: { selectSearchable: "" } }, selectPanel: shortSelectPanel },
    120,
    1024,
  ),
  320,
);
assert(
  samePage.hooks.selectPanelTargetWidth(
    { selectElement: { dataset: { selectSearchable: "" } }, selectPanel: searchableSelectPanel },
    120,
    1024,
  ) > 320,
);
assert.equal(
  samePage.hooks.selectPanelTargetWidth(
    { selectElement: { dataset: { selectPanelMinWidth: "208" } }, selectPanel: shortSelectPanel },
    120,
    1024,
  ),
  208,
);
assert.equal(
  samePage.hooks.selectPanelTargetWidth(
    { selectElement: { dataset: { selectPanelMinWidth: "208" } }, selectPanel: disabledLongSelectPanel },
    120,
    1024,
  ),
  208,
);
assert(
  samePage.hooks.selectPanelTargetWidth(
    { selectElement: { dataset: { selectPanelMinWidth: "208" } }, selectPanel: longSelectPanel },
    120,
    1024,
  ) > 208,
);
assert(
  samePage.hooks.selectPanelTargetWidth(
    { selectElement: { dataset: {} }, selectPanel: wideLatinSelectPanel },
    120,
    1024,
  ) > 500,
);
assert.equal(
  samePage.hooks.selectPanelTargetWidth(
    { selectElement: { dataset: { selectPanelMinWidth: "208" } }, selectPanel: longSelectPanel },
    120,
    260,
  ),
  236,
);
assert.equal(
  samePage.hooks.selectPanelTargetWidth(
    { selectElement: { dataset: { selectPanelMinWidth: "208" } }, selectPanel: longSelectPanel },
    120,
    160,
  ),
  136,
);
const canvasMeasurePage = loadAppWithDom({
  computedFont: "700 16px TestFont",
  canvasMeasureText: (_text, font) => font === "700 16px TestFont" ? 444 : 1,
});
const canvasMeasuredPanel = {
  querySelectorAll: () => [{ textContent: "WW", disabled: false }],
  querySelector: (selector) => selector === "[data-select-option]" ? {} : null,
};
assert.equal(
  canvasMeasurePage.hooks.selectPanelTargetWidth(
    { selectElement: { dataset: {} }, selectPanel: canvasMeasuredPanel },
    120,
    1024,
  ),
  502,
);
const disabledOnlyOption = { textContent: "已停用人员 @old-user", disabled: true, hidden: false };
const disabledOnlyEmpty = { hidden: true };
samePage.hooks.filterSelectOptions(
  {
    selectPanel: {
      querySelectorAll: () => [disabledOnlyOption],
      querySelector: (selector) => selector === "[data-select-empty]" ? disabledOnlyEmpty : null,
    },
  },
  "old-user",
);
assert.equal(disabledOnlyOption.hidden, false);
assert.equal(disabledOnlyEmpty.hidden, false);
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
assert.equal(typeof samePage.hooks.syncRichTextForm, "function");
const failedRichForm = richDiscussionForm("error");
assert.equal(samePage.hooks.syncRichTextForm(failedRichForm.form), false);
assert.equal(failedRichForm.status.textContent, "有文件上传失败，请重试或移除失败项后再提交。");
assert.equal(failedRichForm.bodyInput.value, "");
const readyRichForm = richDiscussionForm("");
assert.equal(samePage.hooks.syncRichTextForm(readyRichForm.form), true);
assert.equal(readyRichForm.bodyInput.value, "<p>保留正文</p>");
assert.equal(readyRichForm.formatInput.value, "html");
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
assert.equal(
  redirectedPost.hooks.webFormSuccessMessage(
    webPostForm(undefined, { buttonText: "全部标为已读" })
  ),
  "全部标为已读成功。",
);
assert.equal(
  redirectedPost.hooks.webFormSuccessMessage(
    webPostForm(undefined, { buttonText: "", ariaLabel: "保存筛选" })
  ),
  "保存筛选成功。",
);
assert.equal(
  redirectedPost.hooks.webFormSuccessMessage(
    webPostForm(undefined, { buttonText: "", buttonValue: "重置密码", submitTagName: "INPUT" })
  ),
  "重置密码成功。",
);

const derivedMessagePost = loadAppWithDom({
  fetch: async () => redirectedHtmlResponse("https://yuance.test/web/me"),
});
await derivedMessagePost.hooks.submitWebForm(
  webPostForm(undefined, { buttonText: "保存资料" })
);
assert.deepEqual(derivedMessagePost.assignCalls, ["https://yuance.test/web/me"]);
assert.deepEqual(JSON.parse(derivedMessagePost.sessionItems.get("yuance-pending-toast")), {
  message: "保存资料成功。",
  tone: "success",
});

const confirmActionPost = loadAppWithDom({
  fetch: async () => redirectedHtmlResponse("https://yuance.test/web/system/users"),
});
await confirmActionPost.hooks.submitWebForm(
  webPostForm(undefined, { buttonText: "禁用", confirmAction: "确认禁用" })
);
assert.deepEqual(confirmActionPost.assignCalls, ["https://yuance.test/web/system/users"]);
assert.deepEqual(JSON.parse(confirmActionPost.sessionItems.get("yuance-pending-toast")), {
  message: "禁用成功。",
  tone: "success",
});

const clickedSubmitterPost = loadAppWithDom({
  fetch: async () => redirectedHtmlResponse("https://yuance.test/web/system/storage"),
});
await clickedSubmitterPost.hooks.submitWebForm(
  webPostForm(undefined, { buttonText: "保存草稿" }),
  {
    tagName: "BUTTON",
    dataset: {},
    disabled: false,
    textContent: "保存并激活",
    getAttribute: () => "",
  },
);
assert.deepEqual(clickedSubmitterPost.assignCalls, ["https://yuance.test/web/system/storage"]);
assert.deepEqual(JSON.parse(clickedSubmitterPost.sessionItems.get("yuance-pending-toast")), {
  message: "保存并激活成功。",
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
