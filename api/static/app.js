(function () {
  var DROPDOWN_TRANSITION_MS = 240;
  var PAGE_TRANSITION_MS = 150;
  var CONTENT_TAB_SLIDE_MS = 360;
  var MODAL_TRANSITION_MS = 240;
  var TOAST_DURATION_MS = 4200;
  var TOAST_STORAGE_KEY = "yuance-pending-toast";
  var THEME_STORAGE_KEY = "yuance-theme";
  var SEARCH_HISTORY_KEY = "yuance-search-history";
  var pendingConfirmForm = null;
  var contentTabNavigationTimer = null;
  var contentTabNavigationControl = null;
  var contentTabResizeObserver = null;
  var contentTabSyncFrame = null;
  var contentTabSyncAnimate = false;
  var activeSelectControl = null;
  var selectMeasureCanvas = null;
  var imagePreviewObserver = null;
  var imagePreviewFallbackTimer = null;
  var imageViewerState = {
    entries: [],
    index: 0,
    scale: 1,
    defaultScale: 1,
    minScale: 1,
    maxScale: 4,
    rotation: 0,
    translateX: 0,
    translateY: 0,
    kind: "image",
    orientation: "",
    source: "",
    dragging: false,
    pointerId: null,
    pointerStartX: 0,
    pointerStartY: 0,
    pointerOriginX: 0,
    pointerOriginY: 0,
  };
  var activeRichAttachmentMenu = null;
  var AVATAR_COLORS = [
    "#1f5fbf",
    "#2d8a68",
    "#a85b00",
    "#b42318",
    "#4656a8",
    "#0f766e",
    "#7c3aed",
    "#be4b00",
  ];

  function readThemePreference() {
    try {
      return window.localStorage.getItem(THEME_STORAGE_KEY) === "dark" ? "dark" : "light";
    } catch (_error) {
      return "light";
    }
  }

  function writeThemePreference(theme) {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch (_error) {
      // localStorage may be disabled; keep the in-page theme applied.
    }
  }

  function applyTheme(theme) {
    var nextTheme = theme === "dark" ? "dark" : "light";
    document.documentElement.dataset.theme = nextTheme;
    document.documentElement.style.colorScheme = nextTheme;
    document.querySelectorAll("[data-theme-toggle]").forEach(function (button) {
      var isDark = nextTheme === "dark";
      var label = button.querySelector("[data-theme-label]");
      button.setAttribute("aria-pressed", isDark ? "true" : "false");
      if (label) {
        label.textContent = isDark ? "亮色模式" : "暗色模式";
      }
    });
  }

  function toggleTheme() {
    var nextTheme = (document.documentElement.dataset.theme || readThemePreference()) === "dark" ? "light" : "dark";
    writeThemePreference(nextTheme);
    applyTheme(nextTheme);
  }

  function showToast(message, tone) {
    var region = document.querySelector("[data-toast-region]");
    if (!region || !message) {
      return;
    }
    var toast = document.createElement("div");
    toast.className = "toast toast-" + (tone || "info");
    toast.setAttribute("role", tone === "error" ? "alert" : "status");

    var icon = document.createElement("span");
    icon.className = "toast-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = tone === "error" ? "!" : tone === "success" ? "✓" : "i";

    var text = document.createElement("span");
    text.className = "toast-message";
    text.textContent = message;

    var close = document.createElement("button");
    close.className = "toast-close";
    close.type = "button";
    close.setAttribute("aria-label", "关闭消息");
    close.textContent = "×";
    toast.append(icon, text, close);
    region.appendChild(toast);

    var removeTimer;
    function removeToast() {
      window.clearTimeout(removeTimer);
      toast.classList.add("leaving");
      window.setTimeout(function () {
        toast.remove();
      }, prefersReducedMotion() ? 0 : 180);
    }
    close.addEventListener("click", removeToast);
    removeTimer = window.setTimeout(removeToast, TOAST_DURATION_MS);
  }

  function queueToast(message, tone) {
    try {
      window.sessionStorage.setItem(
        TOAST_STORAGE_KEY,
        JSON.stringify({ message: message, tone: tone || "success" })
      );
      return true;
    } catch (_error) {
      // The next page can still load when sessionStorage is unavailable.
      return false;
    }
  }

  function showQueuedToast() {
    try {
      var queued = window.sessionStorage.getItem(TOAST_STORAGE_KEY);
      if (!queued) {
        return;
      }
      window.sessionStorage.removeItem(TOAST_STORAGE_KEY);
      var payload = JSON.parse(queued);
      showToast(payload.message, payload.tone);
    } catch (_error) {
      try {
        window.sessionStorage.removeItem(TOAST_STORAGE_KEY);
      } catch (_storageError) {
        // Ignore storage restrictions after the page has already loaded.
      }
    }
  }

  function queueSuccessBeforeNavigation(message) {
    var toastMessage = message || "操作已完成。";
    if (!queueToast(toastMessage, "success")) {
      showToast(toastMessage, "success");
    }
  }

  function controlText(control) {
    if (!control) {
      return "";
    }
    var label = "";
    if (typeof control.getAttribute === "function") {
      label = control.getAttribute("aria-label") || "";
    }
    if (!label && control.value) {
      label = control.value;
    }
    if (!label && control.textContent) {
      label = control.textContent;
    }
    return String(label).replace(/\s+/g, " ").trim();
  }

  function actionSuccessMessage(label) {
    var action = String(label || "")
      .replace(/\s+/g, " ")
      .replace(/^确认\s*/, "")
      .replace(/处理中[.。…]*$/, "")
      .trim();
    if (!action) {
      return "操作已完成。";
    }
    if (/^(保存|创建|修改|重置|启用|禁用|解锁|移除|回滚|归档|恢复|关闭|重新打开|指派|发表|回复|上传|全部标为已读|标为已读|提交)/.test(action)) {
      return action + "成功。";
    }
    return action + "已完成。";
  }

  function webFormSuccessMessage(form, submitter) {
    var explicit = String(form?.dataset?.successMessage || "").trim();
    if (explicit) {
      return explicit;
    }
    var confirmAction = String(form?.dataset?.confirmAction || "").trim();
    if (confirmAction) {
      return actionSuccessMessage(confirmAction);
    }
    return actionSuccessMessage(
      controlText(submitter)
        || controlText(form?.querySelector?.("button[type='submit'], input[type='submit']"))
    );
  }

  function isSuccessWebRedirect(url) {
    try {
      var target = new URL(url, window.location.href);
      var path = target.pathname;
      return (
        target.origin === window.location.origin &&
        (path === "/web" || path.indexOf("/web/") === 0) &&
        path !== "/web/login"
      );
    } catch (_error) {
      return false;
    }
  }

  function notificationKindLabel(kind) {
    return kind === "comment_replied" ? "回复" : "指派";
  }

  function notificationText(value, fallback) {
    var text = value == null ? "" : String(value).trim();
    return text || fallback;
  }

  function notificationMetaText(item) {
    return notificationKindLabel(item.kind) + " · "
      + notificationText(item.actor, "系统") + " · "
      + notificationText(item.created_at, "未知时间");
  }

  function renderNotificationFeed(root, feed) {
    var trigger = root.querySelector("[data-dropdown-trigger]");
    var badge = root.querySelector("[data-notification-badge]");
    var summary = root.querySelector("[data-notification-summary]");
    var list = root.querySelector("[data-notification-list]");
    var readAllButton = root.querySelector("[data-notification-read-all] button[type='submit']");
    var unreadCount = Number(feed && feed.unread_count || 0);
    var unreadLabel = unreadCount > 99 ? "99" : String(unreadCount);
    if (trigger) {
      trigger.setAttribute(
        "aria-label",
        unreadCount ? "打开消息通知，" + unreadCount + " 条未读" : "打开消息通知，暂无未读"
      );
    }
    if (badge) {
      badge.hidden = unreadCount === 0;
      badge.textContent = unreadLabel;
      badge.setAttribute("aria-hidden", unreadCount === 0 ? "true" : "false");
      if (unreadCount) {
        badge.setAttribute("aria-label", "未读消息 " + unreadLabel);
      } else {
        badge.removeAttribute("aria-label");
      }
    }
    if (summary) {
      summary.textContent = unreadCount ? unreadCount + " 条未读" : "暂无未读";
    }
    if (readAllButton) {
      readAllButton.disabled = unreadCount === 0;
    }
    if (!list) {
      return;
    }
    list.replaceChildren();
    var items = feed && Array.isArray(feed.items) ? feed.items : [];
    if (!items.length) {
      var empty = document.createElement("div");
      empty.className = "notification-state";
      empty.textContent = "暂无消息";
      list.appendChild(empty);
      return;
    }
    items.forEach(function (item) {
      var link = document.createElement("a");
      link.className = "notification-item" + (item.read ? "" : " unread");
      link.href = notificationText(item.open_url, "/web/messages");

      var dot = document.createElement("span");
      dot.className = "notification-dot";
      dot.setAttribute("aria-hidden", "true");
      var content = document.createElement("span");
      content.className = "notification-item-content";
      var title = document.createElement("strong");
      title.textContent = notificationText(item.title, "消息通知");
      var detail = document.createElement("span");
      detail.textContent = notificationText(item.body, "查看详情");
      var meta = document.createElement("small");
      meta.textContent = notificationMetaText(item);
      content.append(title, detail, meta);
      link.append(dot, content);
      list.appendChild(link);
    });
  }

  async function initNotificationFeed(root) {
    if (!root) {
      return;
    }
    try {
      var feed = await fetchJson("/api/v1/notifications?limit=5", {
        headers: { accept: "application/json" },
      });
      renderNotificationFeed(root, feed);
    } catch (_error) {
      var summary = root.querySelector("[data-notification-summary]");
      var list = root.querySelector("[data-notification-list]");
      if (summary) {
        summary.textContent = "加载失败";
      }
      if (list) {
        list.innerHTML = '<div class="notification-state">消息加载失败，请稍后重试。</div>';
      }
    }
  }

  function isMessageCenterUrl(url) {
    try {
      var target = new URL(url, window.location.href);
      return target.origin === window.location.origin && target.pathname === "/web/messages";
    } catch (_error) {
      return false;
    }
  }

  function currentMessageCenter() {
    return document.querySelector("[data-message-center]");
  }

  function setMessageCenterLoading(root, loading) {
    if (!root) {
      return;
    }
    root.dataset.messageCenterLoading = loading ? "true" : "false";
    root.setAttribute("aria-busy", loading ? "true" : "false");
  }

  function replaceMessageCenterFromHtml(html) {
    var parser = new DOMParser();
    var nextDocument = parser.parseFromString(html || "", "text/html");
    var current = currentMessageCenter();
    var next = nextDocument.querySelector("[data-message-center]");
    if (!current || !next) {
      throw new Error("消息列表刷新失败，请重新打开消息中心。");
    }
    if (nextDocument.title) {
      document.title = nextDocument.title;
    }
    current.replaceWith(next);
    initContentTabs(next);
    initSelectControls(next);
    return next;
  }

  async function loadMessageCenter(url, options) {
    var root = currentMessageCenter();
    if (!root || !isMessageCenterUrl(url)) {
      return false;
    }
    var nextUrl = new URL(url, window.location.href);
    setMessageCenterLoading(root, true);
    try {
      var response = await fetch(nextUrl.href, {
        method: "GET",
        headers: { accept: "text/html" },
        credentials: "same-origin",
      });
      if (response.status === 401) {
        redirectToLogin();
        return true;
      }
      var html = await response.text();
      if (!response.ok) {
        throw new Error(webFormResultFromHtml(html)?.message || "消息列表加载失败，请稍后重试。");
      }
      var finalUrl = response.url && isMessageCenterUrl(response.url) ? response.url : nextUrl.href;
      replaceMessageCenterFromHtml(html);
      if (options && options.history !== false && window.history && window.history.pushState) {
        if (options.replace) {
          window.history.replaceState({ yuanceMessageCenter: true }, "", finalUrl);
        } else {
          window.history.pushState({ yuanceMessageCenter: true }, "", finalUrl);
        }
      }
      return true;
    } catch (error) {
      setMessageCenterLoading(currentMessageCenter(), false);
      showToast(error instanceof Error ? error.message : "消息列表加载失败，请稍后重试。", "error");
      return true;
    }
  }

  function submitMessageCenterForm(form) {
    var target = new URL(form.action || window.location.href, window.location.href);
    var params = new URLSearchParams(new FormData(form));
    target.search = params.toString();
    loadMessageCenter(target.href, { history: true });
  }

  async function refreshNotificationFeed(root) {
    var notificationRoot = root || document.querySelector("[data-notification-root]");
    if (notificationRoot) {
      await initNotificationFeed(notificationRoot);
    }
  }

  async function submitMessageReadAll(form, submitter) {
    if (!form || form.dataset.webFormBusy === "true") {
      return;
    }
    if (!form.reportValidity()) {
      return;
    }
    var successMessage = webFormSuccessMessage(form, submitter);
    setWebFormBusy(form, true, submitter);
    try {
      var response = await fetch(form.action || "/web/messages/read-all", {
        method: (form.method || "POST").toUpperCase(),
        headers: {
          accept: "text/html, application/json",
          "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
          "x-yuance-web-form": "fetch",
        },
        body: webFormBody(form, submitter),
        credentials: "same-origin",
      });
      var contentType = response.headers.get("content-type") || "";
      var isJson = contentType.includes("application/json");
      var payload = isJson ? await response.json().catch(function () { return {}; }) : null;
      var html = !isJson ? await response.text().catch(function () { return ""; }) : "";
      if (response.status === 401 || payload?.error?.code === "unauthorized") {
        redirectToLogin();
        return;
      }
      if (!response.ok) {
        throw new Error(apiErrorMessage(payload, webFormResultFromHtml(html)?.message || "操作失败，请稍后重试。"));
      }
      var redirectedMessagePage = response.url && isMessageCenterUrl(response.url);
      var keepCurrentMessageUrl = currentMessageCenter()
        && form.matches
        && form.matches("[data-notification-read-all]");
      if (keepCurrentMessageUrl) {
        await loadMessageCenter(window.location.href, { history: false });
      } else if (currentMessageCenter() && redirectedMessagePage && html) {
        replaceMessageCenterFromHtml(html);
        if (window.history && window.history.replaceState) {
          window.history.replaceState({ yuanceMessageCenter: true }, "", response.url);
        }
      } else if (currentMessageCenter()) {
        await loadMessageCenter(window.location.href, { history: false });
      }
      await refreshNotificationFeed(form.closest("[data-notification-root]"));
      showToast(successMessage, "success");
      setWebFormBusy(form, false, submitter);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "操作失败，请稍后重试。", "error");
      setWebFormBusy(form, false, submitter);
    }
  }

  function setWebFormBusy(form, busy, submitter) {
    form.dataset.webFormBusy = busy ? "true" : "false";
    form.setAttribute("aria-busy", busy ? "true" : "false");
    form.querySelectorAll("button[type='submit'], input[type='submit']").forEach(function (control) {
      control.disabled = busy;
    });
    if (submitter && submitter.tagName === "BUTTON") {
      if (busy) {
        submitter.dataset.idleLabel = submitter.textContent;
        submitter.textContent = "处理中...";
      } else if (submitter.dataset.idleLabel) {
        submitter.textContent = submitter.dataset.idleLabel;
        delete submitter.dataset.idleLabel;
      }
    }
  }

  function webFormBody(form, submitter) {
    var formData = new FormData(form);
    if (submitter && submitter.name) {
      formData.append(submitter.name, submitter.value);
    }
    var body = new URLSearchParams();
    formData.forEach(function (value, key) {
      if (typeof value === "string") {
        body.append(key, value);
      }
    });
    return body;
  }

  function webFormJsonBody(form, submitter) {
    var formData = new FormData(form);
    var body = {};
    if (submitter && submitter.name) {
      formData.append(submitter.name, submitter.value);
    }
    formData.forEach(function (value, key) {
      if (typeof value !== "string" || key === "_csrf" || key === "file_object_id") {
        return;
      }
      if ((key === "parent_id" || key === "folder_id") && value.trim() === "") {
        body[key] = null;
        return;
      }
      if (key === "parent_id" || key === "folder_id") {
        body[key] = Number(value);
        return;
      }
      body[key] = value;
    });
    return body;
  }

  function webFormAction(form) {
    var action = form.dataset.action || form.action || window.location.href;
    var fileObjectId = form.querySelector("[data-file-move-file-object-id]")?.value || "";
    return action.replace("{file_object_id}", encodeURIComponent(fileObjectId));
  }

  function webFormResultFromHtml(html) {
    if (!html) {
      return null;
    }
    var result = new DOMParser().parseFromString(html, "text/html").querySelector(".inline-result");
    if (!result) {
      return null;
    }
    var message = result.textContent.trim();
    if (!message) {
      return null;
    }
    return {
      message: message,
      tone: result.classList.contains("storage-message-error") ? "error" : "success",
    };
  }

  function firstApiErrorMessage(value) {
    if (!value) {
      return "";
    }
    if (typeof value === "string") {
      return value.trim();
    }
    if (Array.isArray(value)) {
      for (var index = 0; index < value.length; index += 1) {
        var nestedMessage = firstApiErrorMessage(value[index]);
        if (nestedMessage) {
          return nestedMessage;
        }
      }
      return "";
    }
    if (typeof value !== "object") {
      return "";
    }
    return firstApiErrorMessage(value.error)
      || firstApiErrorMessage(value.message)
      || firstApiErrorMessage(value.detail)
      || firstApiErrorMessage(value.reason)
      || firstApiErrorMessage(value.errors);
  }

  function apiErrorMessage(payload, fallback) {
    return firstApiErrorMessage(payload)
      || fallback
      || "操作失败，请稍后重试。";
  }

  async function submitWebForm(form, submitter) {
    if (!form || form.dataset.webFormBusy === "true") {
      return;
    }
    if (!form.reportValidity()) {
      return;
    }
    var successMessage = webFormSuccessMessage(form, submitter);
    setWebFormBusy(form, true, submitter);
    try {
      if (form.dataset.action) {
        await fetchJson(webFormAction(form), {
          method: (form.dataset.method || form.method || "POST").toUpperCase(),
          headers: {
            accept: "application/json",
            "content-type": "application/json",
          },
          body: JSON.stringify(webFormJsonBody(form, submitter)),
        });
        queueSuccessBeforeNavigation(successMessage);
        window.setTimeout(function () {
          if (form.dataset.successRedirect) {
            window.location.href = form.dataset.successRedirect;
          } else {
            window.location.reload();
          }
        }, 300);
        return;
      }
      var response = await fetch(form.action || window.location.href, {
        method: (form.method || "POST").toUpperCase(),
        headers: {
          accept: "text/html, application/json",
          "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
          "x-yuance-web-form": "fetch",
        },
        body: webFormBody(form, submitter),
        credentials: "same-origin",
      });
      var contentType = response.headers.get("content-type") || "";
      var isJson = contentType.includes("application/json");
      var payload = isJson ? await response.json().catch(function () { return {}; }) : null;
      var html = !isJson ? await response.text().catch(function () { return ""; }) : "";
      var htmlResult = webFormResultFromHtml(html);
      if (response.status === 401 || payload?.error?.code === "unauthorized") {
        redirectToLogin();
        return;
      }
      if (!response.ok) {
        throw new Error(apiErrorMessage(payload, htmlResult?.message || "操作失败，请稍后重试。"));
      }
      if (response.redirected && response.url) {
        if (isSuccessWebRedirect(response.url)) {
          queueSuccessBeforeNavigation(successMessage);
        }
        window.location.assign(response.url);
        return;
      }
      if (html) {
        queueToast(
          htmlResult?.message || successMessage,
          htmlResult?.tone || "success"
        );
      }
      window.location.reload();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "操作失败，请稍后重试。", "error");
      setWebFormBusy(form, false, submitter);
    }
  }

  function avatarInitial(name) {
    var value = (name || "").trim();
    if (!value) {
      return "U";
    }
    return Array.from(value)[0].toLocaleUpperCase("zh-CN");
  }

  function hashText(value) {
    var hash = 2166136261;
    Array.from(value || "").forEach(function (char) {
      hash ^= char.codePointAt(0);
      hash = Math.imul(hash, 16777619);
    });
    return hash >>> 0;
  }

  function initUserAvatars(root) {
    (root || document).querySelectorAll("[data-user-avatar]").forEach(function (avatar) {
      var name = avatar.getAttribute("data-avatar-name") || "";
      avatar.textContent = avatarInitial(name);
      avatar.style.backgroundColor = AVATAR_COLORS[hashText(name) % AVATAR_COLORS.length];
      avatar.style.color = "#fff";
    });
  }

  function readSearchHistory() {
    try {
      var value = JSON.parse(window.localStorage.getItem(SEARCH_HISTORY_KEY) || "[]");
      return Array.isArray(value) ? value.filter(function (item) { return typeof item === "string" && item.trim(); }).slice(0, 5) : [];
    } catch (_error) {
      return [];
    }
  }

  function writeSearchHistory(items) {
    try {
      window.localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(items.slice(0, 5)));
    } catch (_error) {
      // Search continues to work when localStorage is unavailable.
    }
  }

  function closeSearchHistory(form) {
    var panel = form && form.querySelector("[data-search-history]");
    if (!panel || panel.hidden) {
      return;
    }
    panel.classList.remove("open");
    window.setTimeout(function () {
      if (!panel.classList.contains("open")) {
        panel.hidden = true;
      }
    }, prefersReducedMotion() ? 0 : 150);
  }

  function openSearchHistory(form) {
    var panel = form && form.querySelector("[data-search-history]");
    if (!panel) {
      return;
    }
    panel.hidden = false;
    window.requestAnimationFrame(function () {
      panel.classList.add("open");
    });
  }

  function renderSearchHistory(form) {
    var list = form.querySelector("[data-search-history-list]");
    var empty = form.querySelector("[data-search-history-empty]");
    var clear = form.querySelector("[data-search-history-clear]");
    var input = form.querySelector("[data-topbar-search-input]");
    var items = readSearchHistory();
    if (!list || !empty || !input) {
      return;
    }
    list.replaceChildren();
    items.forEach(function (query) {
      var button = document.createElement("button");
      button.className = "topbar-search-history-item";
      button.type = "button";
      button.textContent = query;
      button.addEventListener("click", function () {
        input.value = query;
        form.requestSubmit();
      });
      list.appendChild(button);
    });
    list.hidden = items.length === 0;
    empty.hidden = items.length > 0;
    if (clear) {
      clear.hidden = items.length === 0;
    }
  }

  function initTopbarSearch(root) {
    var input = (root || document).querySelector("[data-topbar-search-input]");
    if (!input) {
      return;
    }
    if (window.location.pathname === "/web/search") {
      input.value = new URLSearchParams(window.location.search).get("q") || "";
    }
    var form = input.closest("form");
    if (!form || form.dataset.searchHistoryInitialized === "true") {
      return;
    }
    form.dataset.searchHistoryInitialized = "true";
    renderSearchHistory(form);
    input.addEventListener("focus", function () {
      renderSearchHistory(form);
      openSearchHistory(form);
    });
    input.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        closeSearchHistory(form);
        input.blur();
      }
    });
    form.addEventListener("submit", function () {
      var query = input.value.trim();
      if (!query) {
        return;
      }
      writeSearchHistory([query].concat(readSearchHistory().filter(function (item) { return item !== query; })));
    });
    var clear = form.querySelector("[data-search-history-clear]");
    if (clear) {
      clear.addEventListener("click", function () {
        writeSearchHistory([]);
        renderSearchHistory(form);
        input.focus({ preventScroll: true });
      });
    }
  }

  var USERNAME_INPUT_SELECTOR = [
    "input[name='username']",
    "input[name='owner_username']",
    "input[name='assignee_username']",
  ].join(", ");

  function compactUsernameValue(value) {
    return (value || "").replace(/\s+/g, "");
  }

  function normalizeUsernameInput(input) {
    if (!input || input.type === "hidden") {
      return;
    }
    var original = input.value || "";
    var compacted = compactUsernameValue(original);
    if (original === compacted) {
      return;
    }

    var start = input.selectionStart;
    var end = input.selectionEnd;
    input.value = compacted;

    if (document.activeElement === input && typeof input.setSelectionRange === "function") {
      try {
        input.setSelectionRange(
          compactUsernameValue(original.slice(0, start || 0)).length,
          compactUsernameValue(original.slice(0, end || 0)).length
        );
      } catch (_error) {
        // Some input types do not expose selection APIs.
      }
    }
  }

  function normalizeUsernameInputs(root) {
    if (!root || typeof root.querySelectorAll !== "function") {
      return;
    }
    root.querySelectorAll(USERNAME_INPUT_SELECTOR).forEach(normalizeUsernameInput);
  }

  function handleUsernameInput(event) {
    if (!event.target || typeof event.target.closest !== "function") {
      return;
    }
    var input = event.target.closest(USERNAME_INPUT_SELECTOR);
    if (input) {
      normalizeUsernameInput(input);
    }
  }

  function initProjectSwitcher(root) {
    (root || document).querySelectorAll("[data-project-switcher]").forEach(function (switcher) {
      var returnTo = switcher.querySelector("input[name='return_to']");
      if (returnTo) {
        returnTo.value = window.location.pathname + window.location.search;
      }
      filterProjectOptions(switcher, "");
    });
  }

  function focusProjectSearch(root) {
    if (!root || !root.matches("[data-project-switcher]")) {
      return;
    }
    var input = root.querySelector("[data-project-search-input]");
    if (!input) {
      return;
    }
    input.value = "";
    filterProjectOptions(root, input.value);
    window.setTimeout(function () {
      input.focus({ preventScroll: true });
      input.select();
    }, prefersReducedMotion() ? 0 : 90);
  }

  function filterProjectOptions(switcher, keyword) {
    var query = (keyword || "").trim().toLocaleLowerCase("zh-CN");
    var visibleCount = 0;
    switcher.querySelectorAll("[data-project-option]").forEach(function (option) {
      var haystack = [
        option.getAttribute("data-project-key") || "",
        option.getAttribute("data-project-name") || "",
        option.textContent || "",
      ].join(" ").toLocaleLowerCase("zh-CN");
      var visible = !query || haystack.indexOf(query) >= 0;
      option.hidden = !visible;
      if (visible) {
        visibleCount += 1;
      }
    });
    var empty = switcher.querySelector("[data-project-empty]");
    if (empty) {
      empty.hidden = visibleCount > 0;
    }
  }

  function submitProjectSwitch(option) {
    var switcher = option.closest("[data-project-switcher]");
    if (!switcher) {
      return;
    }
    var input = switcher.querySelector("input[name='project_key']");
    if (input) {
      input.value = option.getAttribute("data-project-key") || "";
    }
    closeDropdown(switcher);
    if (switcher.requestSubmit) {
      switcher.requestSubmit();
    } else {
      switcher.submit();
    }
  }

  function userComboboxLabel(option) {
    var displayName = option.getAttribute("data-display-name") || "";
    var username = option.getAttribute("data-username") || "";
    if (!displayName) {
      return username;
    }
    return displayName + " @" + username;
  }

  function openUserCombobox(combobox) {
    var input = combobox && combobox.querySelector("[data-user-combobox-input]");
    var panel = combobox && combobox.querySelector("[data-user-combobox-panel]");
    if (!input || !panel || input.disabled) {
      return;
    }
    combobox.classList.add("open");
    panel.hidden = false;
    input.setAttribute("aria-expanded", "true");
  }

  function closeUserCombobox(combobox) {
    var input = combobox && combobox.querySelector("[data-user-combobox-input]");
    var panel = combobox && combobox.querySelector("[data-user-combobox-panel]");
    if (!input || !panel) {
      return;
    }
    combobox.classList.remove("open");
    panel.hidden = true;
    input.setAttribute("aria-expanded", "false");
  }

  function closeUserComboboxes(exceptCombobox) {
    document.querySelectorAll("[data-user-combobox]").forEach(function (combobox) {
      if (combobox !== exceptCombobox) {
        closeUserCombobox(combobox);
      }
    });
  }

  function filterUserOptions(combobox, keyword) {
    var query = (keyword || "").trim().toLocaleLowerCase("zh-CN");
    var visibleCount = 0;
    combobox.querySelectorAll("[data-user-option]").forEach(function (option) {
      var haystack = [
        option.getAttribute("data-username") || "",
        option.getAttribute("data-display-name") || "",
        option.getAttribute("data-roles") || "",
        option.textContent || "",
      ].join(" ").toLocaleLowerCase("zh-CN");
      var visible = !query || haystack.indexOf(query) >= 0;
      option.hidden = !visible;
      option.classList.remove("active");
      if (visible) {
        visibleCount += 1;
      }
    });
    var firstVisible = Array.from(combobox.querySelectorAll("[data-user-option]")).find(function (option) {
      return !option.hidden;
    });
    if (firstVisible) {
      firstVisible.classList.add("active");
    }
    var empty = combobox.querySelector("[data-user-combobox-empty]");
    if (empty) {
      empty.hidden = visibleCount > 0;
      empty.textContent = query ? "没有匹配用户" : "没有可加入用户";
    }
  }

  function clearUserComboboxSelection(combobox) {
    var value = combobox.querySelector("[data-user-combobox-value]");
    var input = combobox.querySelector("[data-user-combobox-input]");
    if (value) {
      value.value = "";
    }
    if (input) {
      input.removeAttribute("data-selected-username");
      input.setCustomValidity("");
    }
  }

  function selectUserOption(option) {
    var combobox = option.closest("[data-user-combobox]");
    if (!combobox) {
      return;
    }
    var input = combobox.querySelector("[data-user-combobox-input]");
    var value = combobox.querySelector("[data-user-combobox-value]");
    var username = option.getAttribute("data-username") || "";
    if (input) {
      input.value = userComboboxLabel(option);
      input.setAttribute("data-selected-username", username);
      input.setCustomValidity("");
    }
    if (value) {
      value.value = username;
    }
    closeUserCombobox(combobox);
  }

  function validateUserCombobox(combobox) {
    var input = combobox.querySelector("[data-user-combobox-input]");
    var value = combobox.querySelector("[data-user-combobox-value]");
    if (!input || input.disabled) {
      return true;
    }
    if (value && value.value) {
      input.setCustomValidity("");
      return true;
    }
    input.setCustomValidity("请从下拉列表中选择用户");
    return false;
  }

  function initUserComboboxes(root) {
    (root || document).querySelectorAll("[data-user-combobox]").forEach(function (combobox) {
      filterUserOptions(combobox, "");
    });
  }

  function memberBatchFormFor(element) {
    return element && element.closest("[data-member-batch-form]");
  }

  function updateMemberBatchForm(form) {
    if (!form) {
      return;
    }
    var selected = form.querySelectorAll("[data-member-candidate-checkbox]:checked").length;
    var count = form.querySelector("[data-member-selected-count]");
    var submit = form.querySelector("[data-member-batch-submit]");
    if (count) {
      count.textContent = "已选择 " + selected + " 人";
    }
    if (submit) {
      submit.disabled = selected === 0;
    }
  }

  function filterMemberCandidates(input) {
    var form = memberBatchFormFor(input);
    if (!form) {
      return;
    }
    var keyword = (input.value || "").trim().toLocaleLowerCase("zh-CN");
    var visibleCount = 0;
    form.querySelectorAll("[data-member-candidate]").forEach(function (candidate) {
      var haystack = [
        candidate.getAttribute("data-username") || "",
        candidate.getAttribute("data-display-name") || "",
        candidate.getAttribute("data-roles") || "",
        candidate.textContent || "",
      ].join(" ").toLocaleLowerCase("zh-CN");
      var visible = !keyword || haystack.indexOf(keyword) >= 0;
      candidate.hidden = !visible;
      if (visible) {
        visibleCount += 1;
      }
    });
    var empty = form.querySelector("[data-member-candidate-empty]");
    if (empty) {
      empty.hidden = visibleCount > 0;
      empty.textContent = keyword ? "没有匹配用户" : "没有可加入用户";
    }
  }

  function initMemberBatchForms(root) {
    (root || document).querySelectorAll("[data-member-batch-form]").forEach(function (form) {
      updateMemberBatchForm(form);
    });
  }

  function updateTokenProjectScope(scope) {
    if (!scope) {
      return;
    }
    var all = scope.querySelector("[data-token-project-all]");
    var options = Array.from(scope.querySelectorAll("[data-token-project-option]"));
    var summary = scope.querySelector("[data-token-project-summary]");
    var allSelected = !all || all.checked;

    options.forEach(function (option) {
      option.disabled = allSelected;
      if (allSelected) {
        option.checked = false;
      }
      var optionLabel = option.closest(".multi-select-option");
      if (optionLabel) {
        optionLabel.classList.toggle("disabled", allSelected);
      }
    });

    if (!summary) {
      return;
    }
    if (allSelected) {
      summary.textContent = "全部项目（包含后续新增）";
      return;
    }

    var selected = options.filter(function (option) { return option.checked; });
    if (selected.length === 0) {
      summary.textContent = "请选择项目";
      return;
    }
    var labels = selected.map(function (option) {
      var label = option.closest(".multi-select-option");
      var strong = label && label.querySelector("strong");
      return strong ? strong.textContent.trim() : option.value;
    });
    summary.textContent = selected.length <= 2
      ? labels.join("、")
      : labels.slice(0, 2).join("、") + " 等 " + selected.length + " 个项目";
  }

  function initTokenProjectScopes(root) {
    (root || document).querySelectorAll("[data-token-project-scope]").forEach(updateTokenProjectScope);
  }

  function selectControlLabel(select) {
    var label = select.labels && select.labels[0];
    if (!label) {
      return select.getAttribute("aria-label") || select.name || "选择选项";
    }
    var textNode = Array.from(label.childNodes).find(function (node) {
      return node.nodeType === Node.TEXT_NODE && node.textContent.trim();
    });
    return textNode ? textNode.textContent.trim() : select.getAttribute("aria-label") || "选择选项";
  }

  function selectedOption(select) {
    return select.options[select.selectedIndex] || select.options[0] || null;
  }

  function syncSelectControl(control) {
    var select = control && control.selectElement;
    var trigger = control && control.querySelector("[data-select-control-trigger]");
    var value = trigger && trigger.querySelector("[data-select-control-value]");
    var option = select && selectedOption(select);
    if (!select || !trigger || !value) {
      return;
    }
    value.textContent = option ? option.textContent.trim() : "请选择";
    trigger.disabled = select.disabled;
    trigger.setAttribute("aria-disabled", select.disabled ? "true" : "false");
    if (select.disabled && activeSelectControl === control) {
      closeSelectControl(control, false);
    }
    control.selectPanel.querySelectorAll("[data-select-option]").forEach(function (button) {
      var selected = button.dataset.value === select.value;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-selected", selected ? "true" : "false");
    });
  }

  function createSelectOptionButton(control, option) {
    var button = document.createElement("button");
    button.className = "select-control-option";
    button.type = "button";
    button.dataset.selectOption = "";
    button.dataset.value = option.value;
    button.disabled = option.disabled;
    button.setAttribute("role", "option");
    var label = document.createElement("span");
    label.className = "select-control-option-label";
    label.textContent = option.textContent.trim();
    button.appendChild(label);
    button.addEventListener("click", function () { chooseSelectOption(control, button); });
    button.addEventListener("keydown", function (event) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        focusSelectOption(control, event.key === "ArrowDown" ? 1 : -1);
      } else if (event.key === "Home" || event.key === "End") {
        event.preventDefault();
        focusSelectOption(control, event.key === "Home" ? "first" : "last");
      } else if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        chooseSelectOption(control, button);
      } else if (event.key === "Escape") {
        event.preventDefault();
        closeSelectControl(control, true);
      }
    });
    return button;
  }

  function renderSelectOptions(control) {
    var select = control && control.selectElement;
    var options = control && control.selectPanel && control.selectPanel.querySelector("[data-select-options]");
    if (!select || !options) {
      return;
    }
    options.replaceChildren();
    select.querySelectorAll("option").forEach(function (option) {
      options.appendChild(createSelectOptionButton(control, option));
    });
    var search = control.selectPanel.querySelector("[data-select-search]");
    filterSelectOptions(control, search ? search.value : "");
    syncSelectControl(control);
    if (activeSelectControl === control) {
      positionSelectPanel(control);
    }
  }

  function measuredTextWidth(text, font) {
    try {
      if (!selectMeasureCanvas) {
        selectMeasureCanvas = document.createElement("canvas");
      }
      var context = selectMeasureCanvas.getContext && selectMeasureCanvas.getContext("2d");
      if (!context) {
        return 0;
      }
      if (font) {
        context.font = font;
      }
      var metrics = context.measureText(String(text || ""));
      return Number.isFinite(metrics.width) ? metrics.width : 0;
    } catch (_error) {
      return 0;
    }
  }

  function selectPanelTextFont(panel) {
    var sample = panel && (
      panel.querySelector("[data-select-option]")
      || panel.querySelector("[data-select-search]")
    );
    if (!sample || !window.getComputedStyle) {
      return "";
    }
    var style = window.getComputedStyle(sample);
    return style.font || [
      style.fontStyle,
      style.fontVariant,
      style.fontWeight,
      style.fontSize,
      style.fontFamily,
    ].filter(Boolean).join(" ");
  }

  function textVisualWidth(text, font) {
    var measured = measuredTextWidth(text, font);
    if (measured > 0) {
      return measured;
    }
    return Array.from(String(text || "")).reduce(function (width, char) {
      var code = char.codePointAt(0) || 0;
      if (/\s/.test(char)) {
        return width + 4;
      }
      if (/[MW@#%&]/.test(char)) {
        return width + 12;
      }
      if (code <= 0x007f || (code >= 0xff61 && code <= 0xff9f)) {
        return width + 7;
      }
      return width + 13;
    }, 0);
  }

  function selectPanelContentMinWidth(control) {
    var panel = control && control.selectPanel;
    if (!panel) {
      return 0;
    }
    var contentWidth = 0;
    var font = selectPanelTextFont(panel);
    panel.querySelectorAll("[data-select-option]").forEach(function (option) {
      if (option.disabled) {
        return;
      }
      contentWidth = Math.max(contentWidth, textVisualWidth(option.textContent, font));
    });
    var search = panel.querySelector("[data-select-search]");
    if (search) {
      contentWidth = Math.max(contentWidth, textVisualWidth(search.placeholder || "", font));
    }
    if (!contentWidth) {
      return 0;
    }
    return Math.ceil(contentWidth + 58);
  }

  function selectPanelTargetWidth(control, triggerWidth, viewportWidth) {
    var select = control && control.selectElement;
    if (!select) {
      return 168;
    }
    var searchable = select.dataset.selectSearchable !== undefined;
    var configuredMinWidth = Number(select.dataset.selectPanelMinWidth || 0);
    var defaultMinWidth = searchable ? 320 : 168;
    var minWidth = Math.max(
      configuredMinWidth > 0 ? configuredMinWidth : defaultMinWidth,
      selectPanelContentMinWidth(control)
    );
    var viewport = Number(viewportWidth || 0);
    var maxWidth = viewport > 24 ? viewport - 24 : (viewport > 0 ? viewport : 168);
    return Math.min(Math.max(Number(triggerWidth || 0), minWidth), maxWidth);
  }

  function positionSelectPanel(control) {
    var panel = control && control.selectPanel;
    var trigger = control && control.querySelector("[data-select-control-trigger]");
    if (!panel || !trigger || panel.hidden) {
      return;
    }
    var rect = trigger.getBoundingClientRect();
    var gutter = 8;
    var width = selectPanelTargetWidth(control, rect.width, window.innerWidth);
    var viewportWidth = Number(window.innerWidth || 0);
    var sideGutter = viewportWidth > 24 ? 12 : 0;
    var left = Math.max(sideGutter, Math.min(rect.left, viewportWidth - width - sideGutter));
    panel.style.width = width + "px";
    panel.style.left = left + "px";
    panel.style.maxHeight = Math.min(320, Math.floor(window.innerHeight * 0.48)) + "px";
    var panelHeight = Math.min(panel.scrollHeight || 240, Math.min(320, window.innerHeight * 0.48));
    var spaceBelow = window.innerHeight - rect.bottom - gutter - 12;
    var openAbove = spaceBelow < panelHeight && rect.top > spaceBelow;
    panel.style.top = (openAbove ? Math.max(12, rect.top - panelHeight - gutter) : rect.bottom + gutter) + "px";
    panel.style.transformOrigin = openAbove ? "bottom center" : "top center";
  }

  function filterSelectOptions(control, keyword) {
    var query = (keyword || "").trim().toLocaleLowerCase("zh-CN");
    var visible = 0;
    control.selectPanel.querySelectorAll("[data-select-option]").forEach(function (option) {
      var matches = !query || (option.textContent || "").toLocaleLowerCase("zh-CN").includes(query);
      option.hidden = !matches;
      if (matches && !option.disabled) {
        visible += 1;
      }
    });
    var empty = control.selectPanel && control.selectPanel.querySelector("[data-select-empty]");
    if (empty) {
      empty.hidden = visible > 0;
    }
  }

  function closeSelectControl(control, restoreFocus) {
    if (!control || control !== activeSelectControl) {
      return;
    }
    var panel = control.selectPanel;
    var trigger = control.querySelector("[data-select-control-trigger]");
    control.classList.remove("open");
    trigger.setAttribute("aria-expanded", "false");
    if (panel) {
      if (control.selectOpenFrame) {
        window.cancelAnimationFrame(control.selectOpenFrame);
        control.selectOpenFrame = null;
      }
      if (control.selectCloseTimer) {
        window.clearTimeout(control.selectCloseTimer);
        control.selectCloseTimer = null;
      }
      panel.classList.remove("open");
      control.selectCloseTimer = window.setTimeout(function () {
        control.selectCloseTimer = null;
        if (!panel.classList.contains("open")) {
          panel.hidden = true;
        }
      }, prefersReducedMotion() ? 0 : 150);
    }
    activeSelectControl = null;
    if (restoreFocus) {
      trigger.focus({ preventScroll: true });
    }
  }

  function focusSelectOption(control, direction) {
    var options = Array.from(control.selectPanel.querySelectorAll("[data-select-option]:not([hidden])"));
    if (options.length === 0) {
      return;
    }
    var focused = control.selectPanel.querySelector("[data-select-option].focused");
    var index = options.indexOf(focused);
    if (direction === "first") {
      index = 0;
    } else if (direction === "last") {
      index = options.length - 1;
    } else {
      index = (index + direction + options.length) % options.length;
    }
    options.forEach(function (option) { option.classList.remove("focused"); });
    options[index].classList.add("focused");
    options[index].focus({ preventScroll: true });
    options[index].scrollIntoView({ block: "nearest" });
  }

  function openSelectControl(control) {
    if (!control || control.selectElement.disabled) {
      return;
    }
    if (activeSelectControl && activeSelectControl !== control) {
      closeSelectControl(activeSelectControl, false);
    }
    var panel = control.selectPanel;
    var trigger = control.querySelector("[data-select-control-trigger]");
    if (control.selectCloseTimer) {
      window.clearTimeout(control.selectCloseTimer);
      control.selectCloseTimer = null;
    }
    panel.hidden = false;
    activeSelectControl = control;
    control.classList.add("open");
    trigger.setAttribute("aria-expanded", "true");
    filterSelectOptions(control, "");
    positionSelectPanel(control);
    if (control.selectOpenFrame) {
      window.cancelAnimationFrame(control.selectOpenFrame);
    }
    control.selectOpenFrame = window.requestAnimationFrame(function () {
      control.selectOpenFrame = null;
      if (activeSelectControl !== control || panel.hidden || !control.classList.contains("open")) {
        return;
      }
      panel.classList.add("open");
      var search = panel.querySelector("[data-select-search]");
      var current = panel.querySelector("[data-select-option].selected");
      if (search) {
        search.value = "";
        search.focus({ preventScroll: true });
      } else if (current) {
        current.classList.add("focused");
        current.focus({ preventScroll: true });
      }
    });
  }

  function chooseSelectOption(control, button) {
    var select = control.selectElement;
    if (!select || !button) {
      return;
    }
    select.value = button.dataset.value || "";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    syncSelectControl(control);
    closeSelectControl(control, true);
  }

  function buildSelectControl(select) {
    if (select.dataset.selectEnhanced === "true" || select.multiple || select.size > 1) {
      return;
    }
    var shouldAutofocus = select.hasAttribute("autofocus") || select.dataset.selectAutofocus === "true";
    if (shouldAutofocus) {
      select.dataset.selectAutofocus = "true";
      select.removeAttribute("autofocus");
    }
    select.dataset.selectEnhanced = "true";
    select.classList.add("select-native");
    select.setAttribute("aria-hidden", "true");
    select.tabIndex = -1;
    var control = document.createElement("div");
    control.className = "select-control";
    control.selectElement = select;

    var trigger = document.createElement("button");
    trigger.className = "select-control-trigger";
    trigger.type = "button";
    trigger.dataset.selectControlTrigger = "";
    trigger.setAttribute("role", "combobox");
    trigger.setAttribute("aria-haspopup", "listbox");
    trigger.setAttribute("aria-expanded", "false");
    trigger.setAttribute("aria-label", selectControlLabel(select));
    if (shouldAutofocus) {
      trigger.setAttribute("autofocus", "");
    }
    var value = document.createElement("span");
    value.className = "select-control-value";
    value.dataset.selectControlValue = "";
    var caret = document.createElement("span");
    caret.className = "select-control-caret";
    caret.setAttribute("aria-hidden", "true");
    trigger.append(value, caret);
    control.appendChild(trigger);
    select.insertAdjacentElement("afterend", control);

    var panel = document.createElement("div");
    panel.className = "select-control-panel";
    panel.hidden = true;
    panel.setAttribute("role", "listbox");
    if (select.dataset.selectSearchable !== undefined) {
      var search = document.createElement("input");
      search.className = "select-control-search";
      search.type = "search";
      search.placeholder = select.dataset.selectSearchPlaceholder || "搜索选项";
      search.autocomplete = "off";
      search.dataset.selectSearch = "";
      panel.appendChild(search);
      search.addEventListener("input", function () { filterSelectOptions(control, search.value); });
      search.addEventListener("keydown", function (event) {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          focusSelectOption(control, "first");
        } else if (event.key === "Escape") {
          event.preventDefault();
          closeSelectControl(control, true);
        }
      });
    }
    var options = document.createElement("div");
    options.className = "select-control-options";
    options.dataset.selectOptions = "";
    var empty = document.createElement("div");
    empty.className = "select-control-empty";
    empty.dataset.selectEmpty = "";
    empty.textContent = "没有匹配选项";
    empty.hidden = true;
    panel.append(options, empty);
    document.body.appendChild(panel);
    control.selectPanel = panel;

    trigger.addEventListener("click", function () {
      if (activeSelectControl === control) {
        closeSelectControl(control, false);
      } else {
        openSelectControl(control);
      }
    });
    trigger.addEventListener("keydown", function (event) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
        event.preventDefault();
        openSelectControl(control);
      }
    });
    select.addEventListener("change", function () { syncSelectControl(control); });
    select.addEventListener("invalid", function (event) {
      event.preventDefault();
      trigger.focus({ preventScroll: true });
      openSelectControl(control);
    });
    select.form?.addEventListener("reset", function () {
      window.setTimeout(function () { syncSelectControl(control); }, 0);
    });
    var selectObserver = new MutationObserver(function (mutations) {
      var optionsChanged = mutations.some(function (mutation) {
        return mutation.type === "childList"
          || mutation.type === "characterData"
          || (mutation.target && mutation.target.tagName === "OPTION");
      });
      if (optionsChanged) {
        renderSelectOptions(control);
      } else {
        syncSelectControl(control);
      }
    });
    selectObserver.observe(select, {
      attributes: true,
      attributeFilter: ["disabled", "value", "label", "selected"],
      childList: true,
      characterData: true,
      subtree: true,
    });
    control.selectObserver = selectObserver;
    renderSelectOptions(control);
  }

  function rebuildSelectControl(select) {
    if (!select || select.dataset.selectEnhanced !== "true") {
      return;
    }
    var control = select.nextElementSibling;
    if (activeSelectControl === control) {
      closeSelectControl(control, false);
    }
    if (control && control.classList.contains("select-control")) {
      if (control.selectOpenFrame) {
        window.cancelAnimationFrame(control.selectOpenFrame);
        control.selectOpenFrame = null;
      }
      if (control.selectCloseTimer) {
        window.clearTimeout(control.selectCloseTimer);
        control.selectCloseTimer = null;
      }
      if (control.selectPanel) {
        control.selectPanel.remove();
      }
      if (control.selectObserver) {
        control.selectObserver.disconnect();
      }
      control.remove();
    }
    delete select.dataset.selectEnhanced;
    select.classList.remove("select-native");
    select.removeAttribute("aria-hidden");
    select.tabIndex = 0;
    buildSelectControl(select);
  }

  function initSelectControls(root) {
    var scope = root || document;
    if (scope.matches && scope.matches("select")) {
      buildSelectControl(scope);
    }
    scope.querySelectorAll?.("select").forEach(buildSelectControl);
  }

  function syncContentTabs(control, animate) {
    var active = control && control.querySelector("[data-content-tab].active");
    var indicator = control && control.querySelector("[data-content-tab-indicator]");
    if (!control || !active || !indicator) {
      return;
    }
    var nextWidth = active.offsetWidth;
    var nextX = Math.max(0, active.offsetLeft - 4);

    if (!animate || prefersReducedMotion()) {
      indicator.style.transition = "none";
      control.style.setProperty("--content-tab-indicator-width", nextWidth + "px");
      control.style.setProperty("--content-tab-indicator-x", nextX + "px");
      window.requestAnimationFrame(function () {
        indicator.style.transition = "";
      });
    } else {
      indicator.style.transition = "";
      void indicator.offsetWidth;
      control.style.setProperty("--content-tab-indicator-width", nextWidth + "px");
      control.style.setProperty("--content-tab-indicator-x", nextX + "px");
    }
  }

  function syncAllContentTabs(animate) {
    document.querySelectorAll("[data-content-tabs]").forEach(function (control) {
      syncContentTabs(control, Boolean(animate));
    });
  }

  function scheduleContentTabsSync(animate) {
    contentTabSyncAnimate = contentTabSyncAnimate || Boolean(animate);
    if (contentTabSyncFrame) {
      return;
    }
    contentTabSyncFrame = window.requestAnimationFrame(function () {
      var shouldAnimate = contentTabSyncAnimate;
      contentTabSyncFrame = null;
      contentTabSyncAnimate = false;
      syncAllContentTabs(shouldAnimate);
    });
  }

  function observeContentTabs(control) {
    if (!control || control.dataset.contentTabsObserved === "true") {
      return;
    }
    control.dataset.contentTabsObserved = "true";
    control.addEventListener("scroll", function () {
      syncContentTabs(control, false);
    }, { passive: true });
    if (!("ResizeObserver" in window)) {
      return;
    }
    if (!contentTabResizeObserver) {
      contentTabResizeObserver = new ResizeObserver(function () {
        scheduleContentTabsSync(false);
      });
    }
    contentTabResizeObserver.observe(control);
    control.querySelectorAll("[data-content-tab]").forEach(function (tab) {
      contentTabResizeObserver.observe(tab);
    });
  }

  function setContentTabsPending(control, pending) {
    if (!control) {
      return;
    }
    control.toggleAttribute("data-content-tabs-pending", Boolean(pending));
    control.setAttribute("aria-busy", pending ? "true" : "false");
  }

  function clearContentTabNavigation() {
    if (contentTabNavigationTimer) {
      window.clearTimeout(contentTabNavigationTimer);
      contentTabNavigationTimer = null;
    }
    if (contentTabNavigationControl) {
      setContentTabsPending(contentTabNavigationControl, false);
      contentTabNavigationControl = null;
    }
  }

  function clearPageTransitionState() {
    document.body.classList.remove("page-leaving");
    clearContentTabNavigation();
  }

  function activateContentTab(item, animateIndicator) {
    var control = item && item.closest("[data-content-tabs]");
    if (!control) {
      return;
    }
    control.querySelectorAll("[data-content-tab]").forEach(function (candidate) {
      var active = candidate === item;
      candidate.classList.toggle("active", active);
      if (candidate.hasAttribute("role")) {
        candidate.setAttribute("aria-selected", active ? "true" : "false");
        candidate.tabIndex = active ? 0 : -1;
      } else if (candidate.matches("a[href]")) {
        if (active) {
          candidate.setAttribute("aria-current", "page");
        } else {
          candidate.removeAttribute("aria-current");
        }
      }
    });
    var targetId = item.getAttribute("data-tab-target");
    var root = item.closest("[data-tabs]");
    if (targetId && root) {
      root.querySelectorAll("[data-tab-panel]").forEach(function (panel) {
        var active = panel.id === targetId;
        panel.classList.toggle("active", active);
        panel.hidden = !active;
      });
    }
    syncContentTabs(control, Boolean(animateIndicator));
  }

  function syncTabUrl(trigger) {
    var root = trigger.closest("[data-tabs-sync-url]");
    var tabKey = trigger.getAttribute("data-tab-key");
    if (!root || !tabKey || !window.history || !window.history.replaceState) {
      return;
    }
    var nextUrl = new URL(window.location.href);
    if (tabKey === "info") {
      nextUrl.searchParams.delete("tab");
    } else {
      nextUrl.searchParams.set("tab", tabKey);
    }
    window.history.replaceState(null, "", nextUrl.pathname + nextUrl.search + nextUrl.hash);
  }

  function initContentTabs(root) {
    (root || document).querySelectorAll("[data-content-tabs]").forEach(function (control) {
      observeContentTabs(control);
      var active = control.querySelector("[data-content-tab].active") || control.querySelector("[data-content-tab]");
      if (active) {
        activateContentTab(active, false);
      }
    });
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () {
        syncAllContentTabs(false);
      }).catch(function () {
        // Font loading failure should not block the existing tab layout.
      });
    }
  }

  function isPreviewableImageType(contentType) {
    return [
      "image/avif",
      "image/bmp",
      "image/gif",
      "image/jpeg",
      "image/png",
      "image/webp",
    ].indexOf((contentType || "").trim().toLowerCase()) >= 0;
  }

  function isPreviewableVideoType(contentType) {
    return ["video/mp4", "video/ogg", "video/quicktime", "video/webm"].indexOf(
      (contentType || "").trim().toLowerCase()
    ) >= 0;
  }

  function formatFileSize(byteSize) {
    var value = Number(byteSize || 0);
    if (!Number.isFinite(value) || value <= 0) {
      return "0 B";
    }
    if (value < 1024) {
      return Math.round(value) + " B";
    }
    var units = ["KB", "MB", "GB"];
    var unitIndex = -1;
    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024;
      unitIndex += 1;
    }
    return (Math.round(value * 10) / 10).toString() + " " + units[unitIndex];
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function pathSegment(value) {
    return encodeURIComponent(String(value == null ? "" : value));
  }

  function clearAttachmentResumeForChangedFile(host, file, idKey, fileKey, uploadedKey) {
    if (!host || !file || !host.dataset[idKey]) {
      return false;
    }
    var pendingFile = host[fileKey];
    if (!pendingFile || pendingFile === file) {
      return false;
    }
    delete host.dataset[idKey];
    delete host[fileKey];
    if (uploadedKey) {
      delete host.dataset[uploadedKey];
    }
    return true;
  }

  function clearAttachmentResumeForRemovedFile(host, idKey, fileKey, uploadedKey) {
    if (!host || !host[fileKey]) {
      return;
    }
    delete host.dataset[idKey];
    delete host[fileKey];
    if (uploadedKey) {
      delete host.dataset[uploadedKey];
    }
  }

  function removeFilePreview(host) {
    if (!host) {
      return;
    }
    var preview = host.querySelector("[data-file-preview]");
    if (!preview) {
      return;
    }
    if (preview.localObjectUrl) {
      URL.revokeObjectURL(preview.localObjectUrl);
    }
    preview.remove();
  }

  function ensureFilePreview(host, anchor) {
    var preview = host.querySelector("[data-file-preview]");
    if (preview) {
      return preview;
    }

    preview = document.createElement("div");
    preview.className = "upload-file-preview";
    preview.dataset.filePreview = "";
    preview.hidden = true;

    var media = document.createElement("button");
    media.className = "upload-file-preview-media";
    media.type = "button";
    media.disabled = true;
    media.dataset.localImagePreview = "";

    var image = document.createElement("img");
    image.alt = "";
    image.hidden = true;
    image.dataset.filePreviewImage = "";

    var video = document.createElement("video");
    video.hidden = true;
    video.muted = true;
    video.preload = "metadata";
    video.playsInline = true;
    video.dataset.filePreviewVideo = "";

    var icon = document.createElement("span");
    icon.className = "upload-file-preview-icon";
    icon.dataset.filePreviewIcon = "";
    icon.textContent = "FILE";
    media.append(image, video, icon);

    var details = document.createElement("div");
    details.className = "upload-file-preview-details";
    var name = document.createElement("strong");
    name.dataset.filePreviewName = "";
    var meta = document.createElement("span");
    meta.dataset.filePreviewMeta = "";
    details.append(name, meta);
    preview.append(media, details);

    if (anchor && anchor.parentElement) {
      anchor.insertAdjacentElement("afterend", preview);
    } else {
      host.appendChild(preview);
    }
    return preview;
  }

  function updateFilePreview(host, anchor, file) {
    if (!file) {
      removeFilePreview(host);
      return;
    }
    var preview = ensureFilePreview(host, anchor);
    if (preview.localObjectUrl) {
      URL.revokeObjectURL(preview.localObjectUrl);
      preview.localObjectUrl = "";
    }

    var media = preview.querySelector("[data-local-image-preview]");
    var image = preview.querySelector("[data-file-preview-image]");
    var video = preview.querySelector("[data-file-preview-video]");
    var icon = preview.querySelector("[data-file-preview-icon]");
    var name = preview.querySelector("[data-file-preview-name]");
    var meta = preview.querySelector("[data-file-preview-meta]");
    var isImage = isPreviewableImageType(file.type);
    var isVideo = isPreviewableVideoType(file.type);

    preview.hidden = false;
    if (name) {
      name.textContent = file.name || "未命名文件";
    }
    if (meta) {
      meta.textContent = (file.type || "未知类型") + " · " + formatFileSize(file.size);
    }
    if (!media || !image || !video || !icon) {
      return;
    }

    if (isImage || isVideo) {
      var objectUrl = URL.createObjectURL(file);
      preview.localObjectUrl = objectUrl;
      if (isImage) {
        image.src = objectUrl;
        image.alt = file.name || "本地图片预览";
        image.hidden = false;
        video.removeAttribute("src");
        video.hidden = true;
        delete media.dataset.mediaKind;
      } else {
        image.removeAttribute("src");
        image.hidden = true;
        video.src = objectUrl;
        video.hidden = false;
        media.dataset.mediaKind = "video";
      }
      icon.hidden = true;
      media.disabled = false;
      media.dataset.imageSource = objectUrl;
      media.dataset.imageTitle = file.name || (isImage ? "本地图片预览" : "本地视频预览");
      media.setAttribute("aria-label", "预览本地" + (isImage ? "图片 " : "视频 ") + (file.name || ""));
    } else {
      image.removeAttribute("src");
      image.hidden = true;
      video.removeAttribute("src");
      video.hidden = true;
      icon.hidden = false;
      media.disabled = true;
      delete media.dataset.imageSource;
      delete media.dataset.imageTitle;
      delete media.dataset.mediaKind;
      media.removeAttribute("aria-label");
    }
  }

  function ensureUploadTransfer(host) {
    var transfer = host.querySelector("[data-upload-transfer]");
    if (transfer) {
      return transfer;
    }

    transfer = document.createElement("div");
    transfer.className = "upload-transfer";
    transfer.dataset.uploadTransfer = "";
    transfer.hidden = true;

    var ring = document.createElement("span");
    ring.className = "upload-progress-ring";
    ring.dataset.uploadProgressRing = "";
    ring.setAttribute("role", "progressbar");
    ring.setAttribute("aria-valuemin", "0");
    ring.setAttribute("aria-valuemax", "100");
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 44 44");
    svg.setAttribute("aria-hidden", "true");
    var track = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    track.setAttribute("class", "upload-progress-track");
    track.setAttribute("cx", "22");
    track.setAttribute("cy", "22");
    track.setAttribute("r", "18");
    var progress = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    progress.setAttribute("class", "upload-progress-value");
    progress.setAttribute("cx", "22");
    progress.setAttribute("cy", "22");
    progress.setAttribute("r", "18");
    progress.dataset.uploadProgressCircle = "";
    svg.append(track, progress);
    var value = document.createElement("span");
    value.dataset.uploadProgressValue = "";
    ring.append(svg, value);

    var details = document.createElement("div");
    details.className = "upload-transfer-details";
    var label = document.createElement("strong");
    label.dataset.uploadProgressLabel = "";
    var description = document.createElement("span");
    description.dataset.uploadProgressDescription = "";
    details.append(label, description);
    transfer.append(ring, details);

    var status = host.querySelector("[data-upload-status]");
    if (status && status.parentElement) {
      status.insertAdjacentElement("beforebegin", transfer);
    } else {
      host.appendChild(transfer);
    }
    return transfer;
  }

  function setUploadTransfer(host, percent, label, description, tone) {
    var transfer = ensureUploadTransfer(host);
    var ring = transfer.querySelector("[data-upload-progress-ring]");
    var progressCircle = transfer.querySelector("[data-upload-progress-circle]");
    var value = transfer.querySelector("[data-upload-progress-value]");
    var labelNode = transfer.querySelector("[data-upload-progress-label]");
    var descriptionNode = transfer.querySelector("[data-upload-progress-description]");
    var hasPercent = typeof percent === "number" && Number.isFinite(percent);
    var normalizedPercent = hasPercent ? Math.max(0, Math.min(100, Math.round(percent))) : 0;

    transfer.hidden = false;
    transfer.dataset.tone = tone || "info";
    if (ring) {
      if (progressCircle) {
        progressCircle.style.strokeDashoffset = String(113.1 - (113.1 * normalizedPercent) / 100);
      }
      if (hasPercent) {
        ring.setAttribute("aria-valuenow", String(normalizedPercent));
        ring.setAttribute("aria-valuetext", (label || "上传中") + " " + normalizedPercent + "%");
      } else {
        ring.removeAttribute("aria-valuenow");
        ring.setAttribute("aria-valuetext", label || "传输中");
      }
    }
    if (value) {
      value.textContent = hasPercent ? normalizedPercent + "%" : "…";
    }
    if (labelNode) {
      labelNode.textContent = label || "准备上传";
    }
    if (descriptionNode) {
      descriptionNode.textContent = description || "";
    }
  }

  function hideUploadTransfer(host) {
    var transfer = host && host.querySelector("[data-upload-transfer]");
    if (transfer) {
      transfer.hidden = true;
    }
  }

  function richTextEditorForForm(form) {
    return form ? form.querySelector("[data-rich-text-editor]") : null;
  }

  function richTextInput(editor) {
    return editor ? editor.querySelector("[data-rich-text-input]") : null;
  }

  function discussionBodyInput(form) {
    return form ? form.querySelector("[data-discussion-body]") : null;
  }

  function resourceFormForEditor(editor) {
    return editor ? editor.closest("[data-resource-form]") : null;
  }

  function richTextCommand(command, editor) {
    var input = richTextInput(editor);
    if (!input) {
      return;
    }
    var attachmentAlign = richTextAlignmentFromCommand(command);
    if (attachmentAlign && applySelectedRichAttachmentAlignment(editor, attachmentAlign)) {
      return;
    }
    input.focus({ preventScroll: true });
    if (command === "createLink") {
      var url = window.prompt("输入链接地址");
      if (!url) {
        return;
      }
      document.execCommand("createLink", false, url);
      return;
    }
    document.execCommand(command, false, null);
  }

  function richTextAlignmentFromCommand(command) {
    if (command === "justifyCenter") {
      return "center";
    }
    if (command === "justifyRight") {
      return "right";
    }
    if (command === "justifyLeft") {
      return "left";
    }
    return "";
  }

  function clearRichAttachmentSelection(editor, except) {
    if (!editor) {
      return;
    }
    editor.querySelectorAll("[data-rich-attachment][data-rich-selected='true']").forEach(function (node) {
      if (node !== except) {
        delete node.dataset.richSelected;
      }
    });
    editor.richSelectedAttachment = except || null;
  }

  function selectRichAttachment(editor, node) {
    if (!editor || !node) {
      return;
    }
    clearRichAttachmentSelection(editor, node);
    node.dataset.richSelected = "true";
    editor.richSelectedAttachment = node;
  }

  function applySelectedRichAttachmentAlignment(editor, align) {
    var node = editor && editor.richSelectedAttachment;
    if (!node || !editor.contains(node)) {
      return false;
    }
    node.dataset.align = align || "left";
    selectRichAttachment(editor, node);
    return true;
  }

  function richTextIsEmptyHtml(html) {
    var text = String(html || "")
      .replace(/<[^>]*>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return !text && html.indexOf("/comments/") < 0 && html.indexOf("/attachments/") < 0;
  }

  function richTextPlainText(editor) {
    var input = richTextInput(editor);
    if (!input) {
      return "";
    }
    var clone = input.cloneNode(true);
    clone.querySelectorAll("[data-rich-attachment]").forEach(function (node) {
      var replacement = document.createElement("span");
      replacement.textContent = " " + (node.dataset.filename || "附件") + " ";
      node.replaceWith(replacement);
    });
    return String(clone.textContent || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function richTextEditorHasUserContent(editor) {
    var input = richTextInput(editor);
    if (!input) {
      return false;
    }
    if (input.querySelector("[data-rich-attachment]")) {
      return true;
    }
    return Boolean(richTextPlainText(editor));
  }

  function richAttachmentMediaKind(contentType) {
    if (isPreviewableImageType(contentType)) {
      return "image";
    }
    if (isPreviewableVideoType(contentType)) {
      return "video";
    }
    return "file";
  }

  function richAttachmentLabel(kind) {
    if (kind === "video") {
      return "正文视频";
    }
    if (kind === "image") {
      return "正文图片";
    }
    return "附件";
  }

  function localRichAttachmentLabel(kind) {
    if (kind === "video") {
      return "待上传视频";
    }
    if (kind === "image") {
      return "待上传图片";
    }
    return "待上传附件";
  }

  function fileExtensionFromName(name) {
    var value = String(name || "").trim();
    if (!value) {
      return "";
    }
    var dotIndex = value.lastIndexOf(".");
    if (dotIndex <= 0 || dotIndex >= value.length - 1) {
      return "";
    }
    return value
      .slice(dotIndex + 1)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "")
      .slice(0, 12);
  }

  function richAttachmentUploadFilename(file) {
    var contentType = file && file.type ? file.type : "";
    var kind = richAttachmentMediaKind(contentType);
    var extension = fileExtensionFromName(file && file.name ? file.name : "");
    if (kind === "image") {
      return extension ? "image." + extension : "image";
    }
    if (kind === "video") {
      return extension ? "video." + extension : "video";
    }
    if (file && file.name) {
      return file.name;
    }
    return extension ? "attachment." + extension : "attachment";
  }

  function richTextDownloadUrl(editor, attachmentId) {
    var resourceForm = resourceFormForEditor(editor);
    var projectKey = editor?.dataset.projectKey || resourceForm?.dataset.resourceProjectKey || "";
    var resourceId = editor?.dataset.resourceId || resourceForm?.dataset.resourceId || "";
    if (projectKey && resourceId && attachmentId) {
      return (
        "/web/projects/" +
        encodeURIComponent(projectKey) +
        "/resources/" +
        encodeURIComponent(String(resourceId)) +
        "/attachments/" +
        encodeURIComponent(String(attachmentId)) +
        "/download"
      );
    }
    var itemKey = editor?.dataset.itemKey || editor?.closest("[data-discussion-form]")?.dataset.itemKey || "";
    var commentId = editor?.dataset.commentId || editor?.closest("[data-discussion-form]")?.dataset.discussionCommentId || "";
    if (!itemKey || !commentId || !attachmentId) {
      return "";
    }
    return (
      "/web/work-items/" +
      encodeURIComponent(itemKey) +
      "/comments/" +
      encodeURIComponent(String(commentId)) +
      "/attachments/" +
      encodeURIComponent(String(attachmentId)) +
      "/download"
    );
  }

  function serializeRichTextEditor(editor) {
    var input = richTextInput(editor);
    if (!input) {
      return "";
    }
    var clone = input.cloneNode(true);
    clone.querySelectorAll("[data-rich-attachment]").forEach(function (node) {
      if (node.dataset.uploadState !== "uploaded" || !node.dataset.attachmentId) {
        node.remove();
        return;
      }
      var filename = node.dataset.filename || "附件";
      var contentType = node.dataset.contentType || "application/octet-stream";
      var attachmentId = node.dataset.attachmentId || "";
      var downloadUrl = node.dataset.downloadUrl || richTextDownloadUrl(editor, attachmentId);
      var isImage = isPreviewableImageType(contentType);
      var isVideo = isPreviewableVideoType(contentType);
      var replacement = document.createElement(isImage || isVideo ? "figure" : "a");
      var align = node.dataset.align || "left";
      replacement.dataset.yuanceAttachmentId = attachmentId;
      replacement.dataset.yuanceAttachmentKind = isImage ? "image" : isVideo ? "video" : "file";
      replacement.dataset.yuanceAlign = align;
      if (isImage) {
        var image = document.createElement("img");
        image.setAttribute("src", downloadUrl);
        image.alt = richAttachmentLabel("image");
        image.setAttribute("loading", "lazy");
        replacement.appendChild(image);
      } else if (isVideo) {
        var video = document.createElement("video");
        video.setAttribute("src", downloadUrl);
        video.setAttribute("controls", "controls");
        video.setAttribute("preload", "metadata");
        video.setAttribute("playsinline", "playsinline");
        video.setAttribute("title", richAttachmentLabel("video"));
        replacement.appendChild(video);
      } else {
        replacement.setAttribute("href", downloadUrl);
        replacement.title = filename;
        replacement.textContent = filename;
      }
      node.replaceWith(replacement);
    });
    clone.querySelectorAll("[contenteditable]").forEach(function (node) {
      node.removeAttribute("contenteditable");
    });
    return clone.innerHTML.trim();
  }

  function syncRichTextForm(form) {
    var editor = richTextEditorForForm(form);
    var bodyInput = discussionBodyInput(form);
    var formatInput = form?.querySelector("[data-discussion-body-format]");
    if (!editor || !bodyInput) {
      return true;
    }
    if (editor.querySelector("[data-rich-attachment][data-upload-state='uploading']")) {
      discussionStatus(form, "文件仍在上传，请等待完成后再提交。", "error");
      return false;
    }
    if (editor.querySelector("[data-rich-attachment][data-upload-state='error']")) {
      discussionStatus(form, "有文件上传失败，请重试或移除失败项后再提交。", "error");
      return false;
    }
    var html = serializeRichTextEditor(editor);
    if (richTextIsEmptyHtml(html)) {
      discussionStatus(form, "评论内容不能为空。", "error");
      richTextInput(editor)?.focus({ preventScroll: true });
      return false;
    }
    bodyInput.value = html;
    if (formatInput) {
      formatInput.value = "html";
    }
    return true;
  }

  function richTextCaretParagraph() {
    var paragraph = document.createElement("p");
    paragraph.appendChild(document.createElement("br"));
    return paragraph;
  }

  function placeCaretInRichTextNode(node) {
    var selection = window.getSelection && window.getSelection();
    if (!selection || !node) {
      return;
    }
    var range = document.createRange();
    range.setStart(node, 0);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function insertNodesAtSelection(input, nodes) {
    input.focus({ preventScroll: true });
    var trailingParagraph = richTextCaretParagraph();
    var fragment = document.createDocumentFragment();
    nodes.forEach(function (node) {
      fragment.appendChild(node);
    });
    fragment.appendChild(trailingParagraph);
    var selection = window.getSelection && window.getSelection();
    if (!selection || selection.rangeCount === 0 || !input.contains(selection.anchorNode)) {
      input.appendChild(fragment);
      placeCaretInRichTextNode(trailingParagraph);
      return;
    }
    var range = selection.getRangeAt(0);
    var startElement = range.startContainer.nodeType === Node.ELEMENT_NODE
      ? range.startContainer
      : range.startContainer.parentElement;
    var block = startElement && startElement.closest("p, div, li");
    if (block && block !== input && input.contains(block)) {
      range = document.createRange();
      range.setStartAfter(block);
      range.collapse(true);
    }
    range.deleteContents();
    range.insertNode(fragment);
    placeCaretInRichTextNode(trailingParagraph);
  }

  function appendTextWithLineBreaks(target, text) {
    String(text || "")
      .replace(/\r\n/g, "\n")
      .replace(/\u00a0/g, " ")
      .replace(/\n+$/g, "")
      .split("\n")
      .forEach(function (line, index) {
        if (index > 0) {
          target.appendChild(document.createElement("br"));
        }
        if (line) {
          target.appendChild(document.createTextNode(line));
        }
      });
  }

  function copyRichClipboardCell(targetCell, sourceCell) {
    if (!targetCell || !sourceCell) {
      return;
    }
    var text = "";
    if (typeof sourceCell.innerText === "string" && sourceCell.innerText) {
      text = sourceCell.innerText;
    } else if (typeof sourceCell.textContent === "string") {
      text = sourceCell.textContent;
    }
    appendTextWithLineBreaks(targetCell, text);
  }

  function copyRichClipboardSpan(sourceCell, targetCell, attributeName) {
    var raw = sourceCell && typeof sourceCell.getAttribute === "function"
      ? sourceCell.getAttribute(attributeName)
      : "";
    if (!raw) {
      return;
    }
    var value = Number(raw);
    if (Number.isFinite(value) && value > 1) {
      targetCell.setAttribute(attributeName, String(Math.round(value)));
    }
  }

  function createRichClipboardRow(sourceRow) {
    if (!sourceRow || !sourceRow.children) {
      return null;
    }
    var row = document.createElement("tr");
    Array.from(sourceRow.children).forEach(function (sourceCell) {
      var tagName = sourceCell.tagName === "TH" ? "th" : sourceCell.tagName === "TD" ? "td" : "";
      if (!tagName) {
        return;
      }
      var targetCell = document.createElement(tagName);
      copyRichClipboardSpan(sourceCell, targetCell, "colspan");
      copyRichClipboardSpan(sourceCell, targetCell, "rowspan");
      copyRichClipboardCell(targetCell, sourceCell);
      row.appendChild(targetCell);
    });
    return row.children.length ? row : null;
  }

  function appendRichClipboardRows(targetSection, sourceContainer) {
    if (!targetSection || !sourceContainer || !sourceContainer.children) {
      return;
    }
    Array.from(sourceContainer.children).forEach(function (sourceRow) {
      if (sourceRow.tagName !== "TR") {
        return;
      }
      var row = createRichClipboardRow(sourceRow);
      if (row) {
        targetSection.appendChild(row);
      }
    });
  }

  function richClipboardTableNodes(html) {
    if (!html || typeof DOMParser === "undefined") {
      return [];
    }
    var parser = new DOMParser();
    var parsed = parser.parseFromString(String(html), "text/html");
    var tables = Array.from(parsed.querySelectorAll ? parsed.querySelectorAll("table") : []);
    return tables
      .map(function (sourceTable) {
        var targetTable = document.createElement("table");
        Array.from(sourceTable.children || []).forEach(function (child) {
          if (child.tagName === "THEAD") {
            var thead = document.createElement("thead");
            appendRichClipboardRows(thead, child);
            if (thead.children.length) {
              targetTable.appendChild(thead);
            }
            return;
          }
          if (child.tagName === "TBODY" || child.tagName === "TFOOT") {
            var tbody = document.createElement("tbody");
            appendRichClipboardRows(tbody, child);
            if (tbody.children.length) {
              targetTable.appendChild(tbody);
            }
            return;
          }
          if (child.tagName === "TR") {
            var directBody = targetTable.lastElementChild;
            if (!directBody || directBody.tagName !== "TBODY") {
              directBody = document.createElement("tbody");
              targetTable.appendChild(directBody);
            }
            var directRow = createRichClipboardRow(child);
            if (directRow) {
              directBody.appendChild(directRow);
            }
          }
        });
        return targetTable.querySelector("tr") ? targetTable : null;
      })
      .filter(Boolean);
  }

  function createRichProgress(percent) {
    var ring = document.createElement("span");
    ring.className = "upload-progress-ring rich-attachment-progress";
    ring.setAttribute("role", "progressbar");
    ring.setAttribute("aria-valuemin", "0");
    ring.setAttribute("aria-valuemax", "100");
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 44 44");
    svg.setAttribute("aria-hidden", "true");
    var track = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    track.setAttribute("class", "upload-progress-track");
    track.setAttribute("cx", "22");
    track.setAttribute("cy", "22");
    track.setAttribute("r", "18");
    var progress = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    progress.setAttribute("class", "upload-progress-value");
    progress.setAttribute("cx", "22");
    progress.setAttribute("cy", "22");
    progress.setAttribute("r", "18");
    progress.dataset.richProgressCircle = "";
    svg.append(track, progress);
    var value = document.createElement("span");
    value.dataset.richProgressValue = "";
    ring.append(svg, value);
    updateRichProgress(ring, percent);
    return ring;
  }

  function updateRichProgress(ring, percent) {
    if (!ring) {
      return;
    }
    var hasPercent = typeof percent === "number" && Number.isFinite(percent);
    var normalized = hasPercent ? Math.max(0, Math.min(100, Math.round(percent))) : 0;
    var circle = ring.querySelector("[data-rich-progress-circle]");
    var value = ring.querySelector("[data-rich-progress-value]");
    if (circle) {
      circle.style.strokeDashoffset = String(113.1 - (113.1 * normalized) / 100);
    }
    if (value) {
      value.textContent = hasPercent ? normalized + "%" : "…";
    }
    if (hasPercent) {
      ring.setAttribute("aria-valuenow", String(normalized));
      ring.setAttribute("aria-valuetext", "上传 " + normalized + "%");
    } else {
      ring.removeAttribute("aria-valuenow");
      ring.setAttribute("aria-valuetext", "上传中");
    }
  }

  function clampNumber(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function setStyleProperty(element, name, value) {
    if (!element || !element.style) {
      return;
    }
    if (typeof element.style.setProperty === "function") {
      element.style.setProperty(name, value);
      return;
    }
    element.style[name] = value;
  }

  function mediaOrientation(width, height) {
    if (!width || !height) {
      return "";
    }
    var ratio = height / width;
    if (ratio >= 1.15) {
      return "portrait";
    }
    if (ratio <= 0.87) {
      return "landscape";
    }
    return "square";
  }

  function inlineMediaWidth(orientation, naturalWidth, portraitMax, squareMax) {
    if (!naturalWidth) {
      return 0;
    }
    if (orientation === "portrait") {
      return Math.min(naturalWidth, portraitMax);
    }
    if (orientation === "square") {
      return Math.min(naturalWidth, squareMax);
    }
    return Math.min(naturalWidth, naturalWidth);
  }

  function applyRichAttachmentOrientation(node, mediaElement) {
    if (!node || !mediaElement) {
      return;
    }
    var naturalWidth = mediaElement.naturalWidth || mediaElement.videoWidth || 0;
    var naturalHeight = mediaElement.naturalHeight || mediaElement.videoHeight || 0;
    var orientation = mediaOrientation(naturalWidth, naturalHeight);
    if (!orientation) {
      return;
    }
    node.dataset.richOrientation = orientation;
    var width = inlineMediaWidth(orientation, naturalWidth, 360, 420);
    if (width > 0) {
      setStyleProperty(node, "--rich-attachment-inline-width", width + "px");
    }
  }

  function bindRichAttachmentOrientation(node, mediaElement) {
    if (!node || !mediaElement) {
      return;
    }
    var apply = function () {
      applyRichAttachmentOrientation(node, mediaElement);
    };
    if (mediaElement.tagName === "VIDEO") {
      mediaElement.addEventListener("loadedmetadata", apply, { once: true });
      if (mediaElement.readyState >= 1) {
        apply();
      }
      return;
    }
    mediaElement.addEventListener("load", apply, { once: true });
    if (mediaElement.complete && mediaElement.naturalWidth) {
      apply();
    }
  }

  function createRichAttachmentNode(file) {
    var kind = richAttachmentMediaKind(file.type || "");
    var isImage = kind === "image";
    var isVideo = kind === "video";
    var node = document.createElement(isImage || isVideo ? "figure" : "span");
    node.className = "rich-attachment " + (isImage || isVideo ? "rich-attachment--media" : "rich-attachment--file");
    node.contentEditable = "false";
    node.dataset.richAttachment = "";
    node.dataset.uploadState = "uploading";
    node.dataset.align = "left";
    node.dataset.filename = file.name || "未命名文件";
    node.dataset.contentType = file.type || "application/octet-stream";

    var media = document.createElement("span");
    media.className = "rich-attachment-media";
    if (isImage || isVideo) {
      var objectUrl = URL.createObjectURL(file);
      node.dataset.objectUrl = objectUrl;
      if (isImage) {
        var image = document.createElement("img");
        image.alt = localRichAttachmentLabel("image");
        bindRichAttachmentOrientation(node, image);
        image.src = objectUrl;
        media.appendChild(image);
      } else {
        var video = document.createElement("video");
        video.muted = true;
        video.preload = "metadata";
        video.playsInline = true;
        bindRichAttachmentOrientation(node, video);
        video.src = objectUrl;
        media.appendChild(video);
      }
    } else {
      media.classList.add("rich-attachment-file-icon");
      media.textContent = (file.name?.split(".").pop() || "FILE").slice(0, 5).toUpperCase();
    }

    var main = document.createElement("span");
    main.className = "rich-attachment-main";
    var name = document.createElement("strong");
    name.textContent = file.name || "未命名文件";
    var status = document.createElement("span");
    status.dataset.richAttachmentStatus = "";
    status.textContent = "准备上传 · " + formatFileSize(file.size);
    main.append(name, status);

    var actions = document.createElement("span");
    actions.className = "rich-attachment-actions";
    var remove = document.createElement("button");
    remove.type = "button";
    remove.dataset.richAttachmentRemove = "";
    remove.textContent = "×";
    remove.setAttribute("aria-label", "移除" + localRichAttachmentLabel(kind));
    actions.append(remove);

    var overlay = document.createElement("span");
    overlay.className = "rich-attachment-overlay";
    var overlayInner = document.createElement("span");
    overlayInner.className = "rich-attachment-overlay-inner";
    var progress = createRichProgress(0);
    var overlayStatus = document.createElement("span");
    overlayStatus.className = "rich-attachment-overlay-status";
    overlayStatus.dataset.richAttachmentOverlayStatus = "";
    overlayStatus.textContent = "准备上传";
    var retry = document.createElement("button");
    retry.type = "button";
    retry.hidden = true;
    retry.dataset.richAttachmentRetry = "";
    retry.textContent = "重试";
    retry.setAttribute("aria-label", "重试上传 " + (file.name || "附件"));
    overlayInner.append(progress, overlayStatus, retry);
    overlay.appendChild(overlayInner);

    if (isImage || isVideo) {
      node.append(media, actions, overlay);
    } else {
      node.append(media, main, actions, overlay);
    }
    return node;
  }

  function bugReportRequestPayload(form) {
    var formData = new FormData(form);
    return {
      project_key: formData.get("project_key") || "",
      item_type: formData.get("item_type") || "bug",
      title: formData.get("title") || "",
      description: formData.get("description") || "",
      priority: formData.get("priority") || "P2",
      assignee_username: formData.get("assignee_username") || "",
      due_date: formData.get("due_date") || "",
      parent_item_key: formData.get("parent_item_key") || "",
    };
  }

  function bugReportUpdatePayload(form) {
    var payload = bugReportRequestPayload(form);
    return {
      title: payload.title,
      description: payload.description,
      priority: payload.priority,
      assignee_username: payload.assignee_username,
      due_date: payload.due_date,
      parent_item_key: payload.parent_item_key,
    };
  }

  function applyBugReportItemContext(form, item) {
    var itemKey = item && item.key ? String(item.key) : "";
    if (!form || !itemKey) {
      return;
    }
    form.dataset.bugReportItemKey = itemKey;
    var editor = richTextEditorForForm(form);
    if (editor) {
      editor.dataset.itemKey = itemKey;
    }
    applyBugReportPersistedLocks(form);
  }

  async function ensureBugReportItemForRichUpload(editor) {
    var form = editor && editor.closest("[data-bug-report-form]");
    if (!form) {
      return null;
    }
    var existingItemKey = form.dataset.bugReportItemKey || editor.dataset.itemKey || "";
    if (existingItemKey) {
      editor.dataset.itemKey = existingItemKey;
      return { key: existingItemKey };
    }
    if (!form.reportValidity()) {
      throw new Error("请先完善工作项标题后再上传附件。");
    }
    if (form.bugReportCreatePromise) {
      return form.bugReportCreatePromise;
    }
    syncBugReportRichDescription(form);
    bugReportStatus(form, "首次上传前正在创建工作项...", "info");
    var promise = fetchJson(form.dataset.bugReportCreateUrl || "/api/v1/work-items", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify(bugReportRequestPayload(form)),
    })
      .then(function (item) {
        applyBugReportItemContext(form, item);
        bugReportStatus(form, "工作项已创建，附件将继续直传。", "success");
        return item;
      })
      .finally(function () {
        form.bugReportCreatePromise = null;
      });
    form.bugReportCreatePromise = promise;
    return promise;
  }

  async function ensureBugReportItemSaved(form) {
    syncBugReportRichDescription(form);
    var existingItemKey = form.dataset.bugReportItemKey || "";
    if (!existingItemKey) {
      if (!form.reportValidity()) {
        throw new Error("请先完善工作项信息。");
      }
      bugReportStatus(form, "正在创建工作项...", "info");
      var created = await fetchJson(form.dataset.bugReportCreateUrl || "/api/v1/work-items", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify(bugReportRequestPayload(form)),
      });
      applyBugReportItemContext(form, created);
      return created;
    }
    bugReportStatus(form, "正在同步工作项信息...", "info");
    var updated = await fetchJson(
      "/api/v1/work-items/" + encodeURIComponent(existingItemKey),
      {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify(bugReportUpdatePayload(form)),
      }
    );
    applyBugReportItemContext(form, updated);
    return updated;
  }

  function applyResourceContext(form, resourceId, projectKey) {
    if (!form || !resourceId) {
      return;
    }
    form.dataset.resourceId = String(resourceId);
    var editor = richTextEditorForForm(form);
    if (editor) {
      editor.dataset.resourceId = String(resourceId);
      editor.dataset.projectKey = projectKey || form.dataset.resourceProjectKey || "";
    }
  }

  function lockResourcePasswordField(form) {
    var field = form && form.querySelector("input[name='access_password']");
    if (!field) {
      return;
    }
    field.disabled = true;
    field.dataset.resourcePasswordLocked = "true";
  }

  async function ensureProjectResourceForRichUpload(editor) {
    var form = resourceFormForEditor(editor);
    if (!form) {
      return null;
    }
    var projectKey = form.dataset.resourceProjectKey || editor.dataset.projectKey || "";
    var existingResourceId = form.dataset.resourceId || editor.dataset.resourceId || "";
    if (existingResourceId) {
      applyResourceContext(form, existingResourceId, projectKey);
      return { id: Number(existingResourceId) };
    }
    if (!form.reportValidity()) {
      throw new Error("请先完善资料标题和访问密码后再上传附件。");
    }
    if (form.resourceCreatePromise) {
      return form.resourceCreatePromise;
    }
    resourceStatus(form, "首次上传前正在创建资料...", "info");
    var formData = new FormData(form);
    var promise = fetchJson(
      form.dataset.resourceCreateUrl ||
        ("/api/v1/projects/" + encodeURIComponent(projectKey) + "/resources"),
      {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          title: formData.get("title") || "",
          category: formData.get("category") || "other",
          body: "",
          body_format: "html",
          access_password: formData.get("access_password") || "",
        }),
      }
    )
      .then(function (created) {
        applyResourceContext(form, created.id, projectKey);
        lockResourcePasswordField(form);
        resourceStatus(form, "资料已创建，附件将继续直传。访问密码已锁定。", "success");
        return created;
      })
      .finally(function () {
        form.resourceCreatePromise = null;
      });
    form.resourceCreatePromise = promise;
    return promise;
  }

  async function ensureDiscussionDraft(editor) {
    if (editor.dataset.commentId) {
      return editor.dataset.commentId;
    }
    var form = editor.closest("[data-discussion-form]");
    if (form && form.dataset.discussionCommentId) {
      editor.dataset.commentId = form.dataset.discussionCommentId;
      return form.dataset.discussionCommentId;
    }
    var itemKey = editor.dataset.itemKey || form?.dataset.itemKey || "";
    if (!itemKey) {
      throw new Error("无法识别工作项，请刷新页面后重试。");
    }
    var parentInput = form?.querySelector("input[name='parent_comment_id']");
    var comment = await fetchJson(
      "/api/v1/work-items/" + encodeURIComponent(itemKey) + "/comments/draft",
      {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          body: "",
          body_format: "html",
          parent_comment_id: parentInput && parentInput.value ? Number(parentInput.value) : null,
        }),
      }
    );
    editor.dataset.commentId = String(comment.id);
    if (form) {
      form.dataset.discussionCommentId = String(comment.id);
      form.dataset.discussionDraft = "true";
    }
    return String(comment.id);
  }

  function setRichAttachmentState(node, state, message, percent) {
    node.dataset.uploadState = state;
    var status = node.querySelector("[data-rich-attachment-status]");
    var overlayStatus = node.querySelector("[data-rich-attachment-overlay-status]");
    var progress = node.querySelector(".rich-attachment-progress");
    var retry = node.querySelector("[data-rich-attachment-retry]");
    if (status) {
      status.textContent = message;
    }
    if (overlayStatus) {
      overlayStatus.textContent = message;
    }
    updateRichProgress(progress, percent);
    if (retry) {
      retry.hidden = state !== "error";
    }
  }

  async function uploadRichAttachment(editor, node, file, options) {
    var uploadOptions = options || {};
    var form = editor.closest("[data-discussion-form]");
    var resourceForm = resourceFormForEditor(editor);
    var uploadController = {
      cancelled: false,
      abort: null,
    };
    node.richUploadController = uploadController;
    if (resourceForm) {
      var projectKey = editor.dataset.projectKey || resourceForm.dataset.resourceProjectKey || "";
      var resourceId = editor.dataset.resourceId || resourceForm.dataset.resourceId || "";
      if (!projectKey || !resourceId) {
        var createdResource = await ensureProjectResourceForRichUpload(editor);
        projectKey = editor.dataset.projectKey || resourceForm.dataset.resourceProjectKey || "";
        resourceId = createdResource && createdResource.id ? String(createdResource.id) : editor.dataset.resourceId || resourceForm.dataset.resourceId || "";
      }
      try {
        var resourceResult = await uploadAttachmentFile({
          file: file,
          filename: richAttachmentUploadFilename(file),
          contentType: file.type || "application/octet-stream",
          byteSize: file.size || 0,
          existingAttachmentId: node.dataset.attachmentId || "",
          createUrl:
            "/api/v1/projects/" + encodeURIComponent(projectKey) +
            "/resources/" + encodeURIComponent(resourceId) + "/attachments",
          uploadUrl: function (attachmentId) {
            return (
              "/api/v1/projects/" + encodeURIComponent(projectKey) +
              "/resources/" + encodeURIComponent(resourceId) +
              "/attachments/" + encodeURIComponent(String(attachmentId)) + "/upload-url"
            );
          },
          completeUrl: function (attachmentId) {
            return (
              "/api/v1/projects/" + encodeURIComponent(projectKey) +
              "/resources/" + encodeURIComponent(resourceId) +
              "/attachments/" + encodeURIComponent(String(attachmentId)) + "/uploaded"
            );
          },
          onAttachmentReady: function (attachment) {
            node.dataset.attachmentId = String(attachment.id);
          },
          shouldCancel: function () {
            return uploadController.cancelled || node.dataset.richDeleteRequested === "true";
          },
          attachAbort: function (abort) {
            uploadController.abort = abort;
          },
          onStage: function (stage) {
            if (stage === "signing") {
              setRichAttachmentState(node, "uploading", "正在获取上传签名 · " + formatFileSize(file.size), 0);
            } else if (stage === "uploading") {
              setRichAttachmentState(node, "uploading", "正在上传 · " + formatFileSize(file.size), 0);
            } else if (stage === "finalizing") {
              setRichAttachmentState(node, "uploading", "正在确认上传结果", 100);
            }
          },
          onProgress: function (percent) {
            setRichAttachmentState(
              node,
              "uploading",
              typeof percent === "number" ? "正在上传 " + Math.round(percent) + "%" : "正在上传",
              percent
            );
          },
        });
        if ((resourceResult && resourceResult.cancelled) || uploadController.cancelled || node.dataset.richDeleteRequested === "true") {
          await deleteRichAttachmentNode(editor, node, { force: true });
          return;
        }
        node.dataset.downloadUrl = richTextDownloadUrl(editor, node.dataset.attachmentId);
        setRichAttachmentState(node, "uploaded", "上传完成 · " + formatFileSize(file.size), 100);
        resourceStatus(resourceForm, "", "info");
      } catch (error) {
        if (uploadController.cancelled || node.dataset.richDeleteRequested === "true") {
          await deleteRichAttachmentNode(editor, node, { force: true });
          return;
        }
        setRichAttachmentState(node, "error", error.message || "上传失败，可重试。", null);
        resourceStatus(resourceForm, error.message || "上传失败，可重试。", "error");
        if (uploadOptions.throwOnError) {
          throw error;
        }
      }
      return;
    }
    var itemKey = editor.dataset.itemKey || form?.dataset.itemKey || "";
    try {
      if (!itemKey && editor.closest("[data-bug-report-form]")) {
        var createdItem = await ensureBugReportItemForRichUpload(editor);
        itemKey = createdItem && createdItem.key ? String(createdItem.key) : editor.dataset.itemKey || "";
      }
      var commentId = await ensureDiscussionDraft(editor);
      var commentResult = await uploadAttachmentFile({
        file: file,
        filename: richAttachmentUploadFilename(file),
        contentType: file.type || "application/octet-stream",
        byteSize: file.size || 0,
        existingAttachmentId: node.dataset.attachmentId || "",
        createUrl:
          "/api/v1/work-items/" + encodeURIComponent(itemKey) +
          "/comments/" + encodeURIComponent(commentId) + "/attachments",
        uploadUrl: function (attachmentId) {
          return attachmentUrlForComment(itemKey, commentId, attachmentId, "upload-url");
        },
        completeUrl: function (attachmentId) {
          return attachmentUrlForComment(itemKey, commentId, attachmentId, "uploaded");
        },
        onAttachmentReady: function (attachment) {
          node.dataset.attachmentId = String(attachment.id);
        },
        shouldCancel: function () {
          return uploadController.cancelled || node.dataset.richDeleteRequested === "true";
        },
        attachAbort: function (abort) {
          uploadController.abort = abort;
        },
        onStage: function (stage) {
          if (stage === "signing") {
            setRichAttachmentState(node, "uploading", "正在获取上传签名 · " + formatFileSize(file.size), 0);
          } else if (stage === "uploading") {
            setRichAttachmentState(node, "uploading", "正在上传 · " + formatFileSize(file.size), 0);
          } else if (stage === "finalizing") {
            setRichAttachmentState(node, "uploading", "正在确认上传结果", 100);
          }
        },
        onProgress: function (percent) {
          setRichAttachmentState(
            node,
            "uploading",
            typeof percent === "number" ? "正在上传 " + Math.round(percent) + "%" : "正在上传",
            percent
          );
        },
      });
      if ((commentResult && commentResult.cancelled) || uploadController.cancelled || node.dataset.richDeleteRequested === "true") {
        await deleteRichAttachmentNode(editor, node, { force: true });
        return;
      }
      node.dataset.downloadUrl = richTextDownloadUrl(editor, node.dataset.attachmentId);
      setRichAttachmentState(node, "uploaded", "上传完成 · " + formatFileSize(file.size), 100);
      if (form) {
        discussionStatus(form, "", "info");
      }
    } catch (error) {
      if (uploadController.cancelled || node.dataset.richDeleteRequested === "true") {
        await deleteRichAttachmentNode(editor, node, { force: true });
        return;
      }
      setRichAttachmentState(node, "error", error.message || "上传失败，可重试。", null);
      if (form) {
        discussionStatus(form, error.message || "上传失败，可重试。", "error");
      }
      if (uploadOptions.throwOnError) {
        throw error;
      }
    }
  }

  function richTextDeleteUrl(editor, attachmentId) {
    var resourceForm = resourceFormForEditor(editor);
    var projectKey = editor?.dataset.projectKey || resourceForm?.dataset.resourceProjectKey || "";
    var resourceId = editor?.dataset.resourceId || resourceForm?.dataset.resourceId || "";
    if (projectKey && resourceId && attachmentId) {
      return (
        "/api/v1/projects/" +
        encodeURIComponent(projectKey) +
        "/resources/" +
        encodeURIComponent(String(resourceId)) +
        "/attachments/" +
        encodeURIComponent(String(attachmentId))
      );
    }
    var itemKey = editor?.dataset.itemKey || editor?.closest("[data-discussion-form]")?.dataset.itemKey || "";
    var commentId = editor?.dataset.commentId || editor?.closest("[data-discussion-form]")?.dataset.discussionCommentId || "";
    if (!itemKey || !commentId || !attachmentId) {
      return "";
    }
    return (
      "/api/v1/work-items/" +
      encodeURIComponent(itemKey) +
      "/comments/" +
      encodeURIComponent(String(commentId)) +
      "/attachments/" +
      encodeURIComponent(String(attachmentId))
    );
  }

  function cleanupRichAttachmentNode(node) {
    if (!node) {
      return;
    }
    if (node.dataset.objectUrl) {
      URL.revokeObjectURL(node.dataset.objectUrl);
      delete node.dataset.objectUrl;
    }
    node.richFile = null;
  }

  async function deleteRichAttachmentNode(editor, node, options) {
    var deleteOptions = options || {};
    if (!editor || !node) {
      return;
    }
    var attachmentId = node.dataset.attachmentId || "";
    var deleteUrl = richTextDeleteUrl(editor, attachmentId);
    if (!attachmentId || !deleteUrl || (node.dataset.richDeleteIssued === "true" && !deleteOptions.force)) {
      return;
    }
    node.dataset.richDeleteIssued = "true";
    await fetchJson(deleteUrl, {
      method: "DELETE",
      headers: { accept: "application/json" },
    });
  }

  async function removeRichAttachmentNode(node) {
    if (!node || node.dataset.richRemoving === "true") {
      return;
    }
    var editor = node.closest("[data-rich-text-editor]");
    node.dataset.richRemoving = "true";
    node.dataset.richDeleteRequested = "true";
    var controller = node.richUploadController;
    if (controller) {
      controller.cancelled = true;
      if (typeof controller.abort === "function") {
        controller.abort();
      }
    }
    setRichAttachmentState(node, "uploading", "正在移除附件...", null);
    if (!node.dataset.attachmentId) {
      cleanupRichAttachmentNode(node);
      node.remove();
      return;
    }
    try {
      await deleteRichAttachmentNode(editor, node);
      cleanupRichAttachmentNode(node);
      node.remove();
    } catch (error) {
      node.dataset.richRemoving = "false";
      node.dataset.richDeleteRequested = "false";
      delete node.dataset.richDeleteIssued;
      setRichAttachmentState(node, "error", error.message || "移除失败，请重试。", null);
      showToast(error.message || "附件移除失败，请重试。", "error");
    }
  }

  function insertRichFiles(editor, files) {
    var input = richTextInput(editor);
    if (!input || !files.length) {
      return;
    }
    var nodes = files.map(function (file) {
      var node = createRichAttachmentNode(file);
      node.richFile = file;
      return node;
    });
    insertNodesAtSelection(input, nodes);
    nodes.forEach(function (node) {
      uploadRichAttachment(editor, node, node.richFile);
    });
  }

  function initRichTextEditors(scope) {
    (scope || document).querySelectorAll("[data-rich-text-editor]:not([data-rich-ready])").forEach(function (editor) {
      editor.dataset.richReady = "true";
      var input = richTextInput(editor);
      if (!input) {
        return;
      }
      editor.addEventListener("click", function (event) {
        if (event.target.closest("[data-rich-command]")) {
          return;
        }
        var attachment = event.target.closest("[data-rich-attachment]");
        if (attachment && editor.contains(attachment)) {
          selectRichAttachment(editor, attachment);
        } else {
          clearRichAttachmentSelection(editor, null);
        }
      });
      input.addEventListener("paste", function (event) {
        var files = Array.from(event.clipboardData?.files || []);
        if (files.length) {
          event.preventDefault();
          insertRichFiles(editor, files);
          return;
        }
        var tableNodes = richClipboardTableNodes(event.clipboardData?.getData("text/html") || "");
        if (tableNodes.length) {
          event.preventDefault();
          insertNodesAtSelection(input, tableNodes);
          return;
        }
        var text = event.clipboardData?.getData("text/plain");
        if (text) {
          event.preventDefault();
          document.execCommand("insertText", false, text);
        }
      });
      ["dragenter", "dragover"].forEach(function (eventName) {
        input.addEventListener(eventName, function (event) {
          if (Array.from(event.dataTransfer?.items || []).some(function (item) { return item.kind === "file"; })) {
            event.preventDefault();
            editor.dataset.dragActive = "true";
          }
        });
      });
      ["dragleave", "drop"].forEach(function (eventName) {
        input.addEventListener(eventName, function (event) {
          if (eventName === "drop") {
            var files = Array.from(event.dataTransfer?.files || []);
            if (files.length) {
              event.preventDefault();
              insertRichFiles(editor, files);
            }
          }
          editor.dataset.dragActive = "false";
        });
      });
    });
  }

  function directUploadStatus(form, message, tone) {
    var status = form.querySelector("[data-upload-status]");
    setStatusMessage(status, message, tone);
  }

  function setStatusMessage(status, message, tone) {
    if (!status) {
      return;
    }
    if (!("idleText" in status.dataset)) {
      status.dataset.idleText = status.textContent || "";
      status.dataset.idleTone = status.dataset.tone || "info";
      status.dataset.idleHidden = status.hidden ? "true" : "false";
    }
    if (!message) {
      status.textContent = status.dataset.idleText || "";
      status.dataset.tone = status.dataset.idleTone || "info";
      status.hidden = status.dataset.idleHidden === "true";
      return;
    }
    status.hidden = false;
    status.textContent = message;
    status.dataset.tone = tone || "info";
  }

  function bugReportStatus(form, message, tone) {
    var status = form.querySelector("[data-bug-report-status]");
    setStatusMessage(status, message, tone);
  }

  function resourceStatus(form, message, tone) {
    var status = form.querySelector("[data-resource-status]");
    setStatusMessage(status, message, tone);
  }

  function setDirectUploadBusy(form, busy) {
    form.dataset.uploadBusy = busy ? "true" : "false";
    form.querySelectorAll("input, select, textarea, button").forEach(function (control) {
      if (control.matches("[data-modal-close]")) {
        return;
      }
      control.disabled = busy;
    });
  }

  function setBugReportBusy(form, busy) {
    form.dataset.bugReportBusy = busy ? "true" : "false";
    form.querySelectorAll("input, select, textarea, button").forEach(function (control) {
      if (control.matches("[data-modal-close]")) {
        return;
      }
      control.disabled = busy || isBugReportControlLocked(form, control);
    });
    form.querySelectorAll("[data-rich-text-input]").forEach(function (input) {
      input.setAttribute("contenteditable", busy ? "false" : "true");
    });
  }

  function setResourceBusy(form, busy) {
    form.dataset.resourceBusy = busy ? "true" : "false";
    form.querySelectorAll("input, select, textarea, button").forEach(function (control) {
      if (control.matches("[data-modal-close]")) {
        return;
      }
      control.disabled = busy || control.dataset.resourcePasswordLocked === "true";
    });
    form.querySelectorAll("[data-rich-text-input]").forEach(function (input) {
      input.setAttribute("contenteditable", busy ? "false" : "true");
    });
  }

  function syncDirectUploadMetadata(form, files) {
    var filename = form.querySelector("[data-attachment-filename]");
    var contentType = form.querySelector("[data-attachment-content-type]");
    var byteSize = form.querySelector("[data-attachment-byte-size]");
    var totalSize = files.reduce(function (sum, file) {
      return sum + Number(file.size || 0);
    }, 0);

    if (!files.length) {
      if (filename) {
        filename.value = "";
      }
      if (contentType) {
        contentType.value = "application/octet-stream";
      }
      if (byteSize) {
        byteSize.value = "0";
      }
      return;
    }
    if (filename) {
      filename.value = files.length === 1
        ? files[0].name || "attachment.bin"
        : "已选择 " + files.length + " 个文件";
    }
    if (contentType) {
      contentType.value = files.length === 1
        ? files[0].type || "application/octet-stream"
        : "多个文件";
    }
    if (byteSize) {
      byteSize.value = String(files.length === 1 ? files[0].size || 0 : totalSize);
    }
  }

  function syncAttachmentFileFields(form) {
    var fileInput = form.querySelector("[data-attachment-file]");
    var selected = fileInput && fileInput.files ? Array.from(fileInput.files) : [];
    var file = selected[0] || null;
    var previewAnchor = fileInput && fileInput.closest(".upload-picker");
    var acceptsMultiple = Boolean(fileInput && fileInput.multiple && !form.dataset.existingAttachmentId);
    if (acceptsMultiple) {
      var files = form.bugReportFiles || [];
      var signatures = new Set(files.map(function (entry) { return entry.signature; }));
      selected.forEach(function (selectedFile) {
        var signature = composerFileSignature(selectedFile);
        if (!signatures.has(signature)) {
          files.push({ file: selectedFile, signature: signature, attachmentId: "", uploaded: false, objectUrl: "" });
          signatures.add(signature);
        }
      });
      form.bugReportFiles = files;
      fileInput.value = "";
      removeFilePreview(form);
      renderComposerFiles(form);
      if (!files.length) {
        syncDirectUploadMetadata(form, []);
        hideUploadTransfer(form);
        directUploadStatus(form, "等待选择文件。", "info");
        return;
      }
      syncDirectUploadMetadata(form, files.map(function (entry) { return entry.file; }));
      directUploadStatus(form, "已选择 " + files.length + " 个文件，可继续添加或移除。", "ready");
      setUploadTransfer(form, 0, "准备上传", "共 " + files.length + " 个文件等待提交。", "ready");
      return;
    }
    if (!file) {
      clearAttachmentResumeForRemovedFile(
        form,
        "existingAttachmentId",
        "pendingAttachmentFile"
      );
      removeFilePreview(form);
      hideUploadTransfer(form);
      directUploadStatus(form, "等待选择文件。", "info");
      return;
    }
    var isNewFile = clearAttachmentResumeForChangedFile(
      form,
      file,
      "existingAttachmentId",
      "pendingAttachmentFile"
    );
    var isResume = Boolean(form.dataset.existingAttachmentId);
    syncDirectUploadMetadata(form, [file]);
    updateFilePreview(form, previewAnchor || fileInput, file);
    directUploadStatus(
      form,
      "已选择 " +
        (file.name || "附件") +
        (isResume
          ? "，点击继续上传会覆盖该附件对象。"
          : isNewFile
            ? "，已更换文件，将重新登记附件后直传对象存储。"
            : "，点击上传后会直传对象存储。"),
      "ready"
    );
    setUploadTransfer(form, 0, "准备上传", "已选择 " + formatFileSize(file.size) + "，等待提交。", "ready");
  }

  function directUploadHeaderPairs(headerPairs, fallbackContentType) {
    var headers = [];
    var seen = {};
    (headerPairs || []).forEach(function (pair) {
      var key = pair && pair[0] ? String(pair[0]) : "";
      var value = pair && pair[1] ? String(pair[1]) : "";
      var normalizedKey = key.toLowerCase();
      if (!key || ["host", "content-length"].indexOf(normalizedKey) >= 0) {
        return;
      }
      headers.push([key, value]);
      seen[normalizedKey] = true;
    });
    if (fallbackContentType && !seen["content-type"]) {
      headers.push(["content-type", fallbackContentType]);
    }
    return headers;
  }

  function uploadSignedFile(request, file, contentType, onProgress, attachAbort) {
    return new Promise(function (resolve, reject) {
      if (!request || !request.url) {
        reject(new Error("上传签名缺少目标地址。"));
        return;
      }

      var xhr = new XMLHttpRequest();
      xhr.open(request.method || "PUT", request.url, true);
      try {
        directUploadHeaderPairs(request.headers, contentType).forEach(function (pair) {
          xhr.setRequestHeader(pair[0], pair[1]);
        });
        var signedUrl = new URL(request.url, window.location.href);
        if (
          signedUrl.origin === window.location.origin &&
          signedUrl.pathname === "/api/v1/test-storage/upload"
        ) {
          var token = csrfToken();
          if (token) {
            xhr.setRequestHeader("x-yuance-csrf-token", token);
          }
        }
      } catch (_error) {
        reject(new Error("上传签名请求头无效。"));
        return;
      }
      if (typeof attachAbort === "function") {
        attachAbort(function () {
          xhr.abort();
        });
      }

      xhr.upload.addEventListener("progress", function (event) {
        if (typeof onProgress !== "function") {
          return;
        }
        if (event.lengthComputable && event.total > 0) {
          onProgress((event.loaded / event.total) * 100, event.loaded, event.total);
        } else {
          onProgress(null, event.loaded || 0, 0);
        }
      });
      xhr.addEventListener("load", function () {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
          return;
        }
        reject(new Error("对象存储上传失败：" + xhr.status));
      });
      xhr.addEventListener("error", function () {
        reject(new Error("对象存储上传连接失败，请检查网络后重试。"));
      });
      xhr.addEventListener("abort", function () {
        reject(new Error("对象存储上传已取消。"));
      });
      xhr.send(file);
    });
  }

  function attachmentUrlFromTemplate(template, attachmentId) {
    return (template || "").replace("{id}", encodeURIComponent(String(attachmentId)));
  }

  function attachmentUrlForComment(itemKey, commentId, attachmentId, action) {
    return (
      "/api/v1/work-items/" +
      encodeURIComponent(itemKey) +
      "/comments/" +
      encodeURIComponent(String(commentId)) +
      "/attachments/" +
      encodeURIComponent(String(attachmentId)) +
      "/" +
      action
    );
  }

  function reloadDiscussionAtComment(itemKey, commentId) {
    var targetPath = "/web/work-items/" + encodeURIComponent(itemKey);
    var targetHash = "comment-" + encodeURIComponent(String(commentId));
    if (window.location.pathname === targetPath) {
      window.location.hash = targetHash;
      window.location.reload();
      return;
    }
    window.location.assign(targetPath + "#" + targetHash);
  }

  function csrfToken() {
    return document
      .querySelector('meta[name="yuance-csrf-token"]')
      ?.getAttribute("content") || "";
  }

  function redirectToLogin() {
    if (window.location.pathname === "/web/login") {
      return;
    }
    window.location.href = "/web/login";
  }

  async function fetchJson(url, options) {
    var requestOptions = options || {};
    var method = (requestOptions.method || "GET").toUpperCase();
    var headers = new Headers(requestOptions.headers || {});
    var token = csrfToken();
    if (token && method !== "GET" && method !== "HEAD") {
      headers.set("x-yuance-csrf-token", token);
    }
    var response = await fetch(url, Object.assign({}, requestOptions, { headers: headers }));
    var payload = await response.json().catch(function () {
      return {};
    });
    if (response.status === 401 || (payload && payload.error && payload.error.code === "unauthorized")) {
      redirectToLogin();
      throw new Error("登录已失效，正在跳转登录页面。");
    }
    if (!response.ok) {
      throw new Error(apiErrorMessage(payload, "请求失败：" + response.status));
    }
    return payload.data;
  }

  async function uploadAttachmentFile(options) {
    var file = options.file;
    var filename = options.filename || file.name || "attachment.bin";
    var contentType = options.contentType || file.type || "application/octet-stream";
    var byteSize = Number(options.byteSize || file.size || 0);
    var shouldCancel = typeof options.shouldCancel === "function"
      ? options.shouldCancel
      : function () { return false; };
    var attachment;
    if (options.existingAttachmentId) {
      attachment = { id: options.existingAttachmentId };
    } else {
      var createPayload = {
        original_filename: filename,
        content_type: contentType,
        byte_size: byteSize,
      };
      if (options.folderId) {
        createPayload.folder_id = Number(options.folderId);
      }
      attachment = await fetchJson(options.createUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify(createPayload),
      });
    }
    if (typeof options.onAttachmentReady === "function") {
      options.onAttachmentReady(attachment);
    }
    if (shouldCancel()) {
      return { cancelled: true, attachment: attachment };
    }

    if (typeof options.onStage === "function") {
      options.onStage("signing");
    }
    var signed = await fetchJson(options.uploadUrl(attachment.id), {
      method: "GET",
      headers: { accept: "application/json" },
    });
    if (shouldCancel()) {
      return { cancelled: true, attachment: attachment };
    }

    var request = signed.request || {};
    if (typeof options.onStage === "function") {
      options.onStage("uploading");
    }
    await uploadSignedFile(
      request,
      file,
      contentType,
      options.onProgress,
      options.attachAbort
    );
    if (shouldCancel()) {
      return { cancelled: true, attachment: attachment };
    }

    if (typeof options.onStage === "function") {
      options.onStage("finalizing");
    }
    var completed = await fetchJson(options.completeUrl(attachment.id), {
      method: "POST",
      headers: { accept: "application/json" },
    });
    if (typeof options.onStage === "function") {
      options.onStage("completed");
    }
    if (shouldCancel()) {
      return { cancelled: true, attachment: completed };
    }
    return completed;
  }

  async function submitDirectUpload(form) {
    if (form.dataset.uploadBusy === "true") {
      return;
    }
    if (!form.reportValidity()) {
      return;
    }
    var fileInput = form.querySelector("[data-attachment-file]");
    var entries = fileInput && fileInput.multiple && !form.dataset.existingAttachmentId
      ? (form.bugReportFiles || [])
      : [];
    var file = entries.length
      ? entries[0].file
      : fileInput && fileInput.files
        ? fileInput.files[0]
        : null;
    if (!file && !entries.length) {
      directUploadStatus(form, "请先选择要上传的文件。", "error");
      return;
    }

    setDirectUploadBusy(form, true);
    var existingAttachmentId = form.dataset.existingAttachmentId || "";
    var uploadEntries = entries.length
      ? entries
      : [{ file: file, attachmentId: existingAttachmentId, uploaded: false }];
    var selectedFileDescription = uploadEntries.length === 1
      ? formatFileSize(file.size)
      : uploadEntries.length + " 个文件";
    directUploadStatus(form, existingAttachmentId ? "正在获取上传签名..." : "正在登记附件元数据...", "info");
    setUploadTransfer(
      form,
      0,
      existingAttachmentId ? "准备继续上传" : "正在登记附件",
      existingAttachmentId ? "正在复用已登记附件。" : "正在保存 " + selectedFileDescription + " 的元数据。",
      "info"
    );
    try {
      for (var index = 0; index < uploadEntries.length; index += 1) {
        var entry = uploadEntries[index];
        if (entry.uploaded) {
          continue;
        }
        var currentFile = entry.file;
        var fileNumber = index + 1;
        var fileCount = uploadEntries.length;
        var singleUpload = fileCount === 1;
        await uploadAttachmentFile({
          file: currentFile,
          filename: singleUpload
            ? form.querySelector("[data-attachment-filename]")?.value || currentFile.name
            : currentFile.name || "attachment.bin",
          contentType: singleUpload
            ? form.querySelector("[data-attachment-content-type]")?.value ||
              currentFile.type ||
              "application/octet-stream"
            : currentFile.type || "application/octet-stream",
          byteSize: singleUpload
            ? Number(form.querySelector("[data-attachment-byte-size]")?.value || currentFile.size || 0)
            : currentFile.size || 0,
          folderId: form.querySelector("select[name='folder_id']")?.value || "",
          existingAttachmentId: entry.attachmentId || "",
          createUrl: form.dataset.attachmentCreateUrl,
          uploadUrl: function (attachmentId) {
            return attachmentUrlFromTemplate(form.dataset.attachmentUploadUrlTemplate, attachmentId);
          },
          completeUrl: function (attachmentId) {
            return attachmentUrlFromTemplate(form.dataset.attachmentCompleteUrlTemplate, attachmentId);
          },
          onAttachmentReady: function (attachment) {
            entry.attachmentId = String(attachment.id);
            if (singleUpload) {
              form.dataset.existingAttachmentId = String(attachment.id);
              form.pendingAttachmentFile = currentFile;
            }
          },
          onStage: function (stage) {
            var base = (index / fileCount) * 100;
            if (stage === "signing") {
              directUploadStatus(form, "正在获取上传签名 " + fileNumber + "/" + fileCount + "...", "info");
              setUploadTransfer(form, base, "正在获取上传签名", currentFile.name || selectedFileDescription, "info");
            } else if (stage === "uploading") {
              directUploadStatus(form, "正在直传文件 " + fileNumber + "/" + fileCount + "...", "info");
              setUploadTransfer(form, base, "正在上传", currentFile.name || selectedFileDescription, "info");
            } else if (stage === "finalizing") {
              directUploadStatus(form, "正在确认上传结果 " + fileNumber + "/" + fileCount + "...", "info");
              setUploadTransfer(form, (fileNumber / fileCount) * 100, "正在确认上传结果", "正在更新附件状态。", "info");
            }
          },
          onProgress: function (percent) {
            if (typeof percent === "number") {
              var overall = ((index + percent / 100) / fileCount) * 100;
              setUploadTransfer(form, overall, "正在上传", "文件 " + fileNumber + "/" + fileCount + " 已传输 " + Math.round(percent) + "% 。", "info");
            } else {
              setUploadTransfer(form, null, "正在上传", "浏览器未提供可计算的传输长度。", "info");
            }
          },
        });
        entry.uploaded = true;
        renderComposerFiles(form);
      }
      setUploadTransfer(form, 100, "上传完成", uploadEntries.length + " 个附件已安全写入对象存储。", "success");
      if (!existingAttachmentId) {
        directUploadStatus(form, uploadEntries.length + " 个附件上传完成，正在刷新页面。", "success");
      } else {
        directUploadStatus(form, "附件继续上传完成，正在刷新页面。", "success");
      }
      queueSuccessBeforeNavigation(
        existingAttachmentId
          ? "附件继续上传完成。"
          : uploadEntries.length + " 个附件上传完成。"
      );
      window.setTimeout(function () {
        window.location.href = form.dataset.successRedirect || window.location.href;
      }, 450);
    } catch (error) {
      directUploadStatus(form, error.message || "附件上传失败，请稍后重试。", "error");
      setUploadTransfer(form, null, "上传失败", "已保留当前文件和待上传附件，可直接重试。", "error");
      setDirectUploadBusy(form, false);
    }
  }

  function updateBugReportGroupTitles(form) {
    var groups = Array.from(form.querySelectorAll("[data-bug-report-group]"));
    groups.forEach(function (group, index) {
      var title = group.querySelector("[data-bug-report-group-title]");
      if (title) {
        title.textContent = "第 " + (index + 1) + " 组";
      }
      var remove = group.querySelector("[data-bug-report-remove]");
      if (remove) {
        remove.hidden = groups.length <= 1;
      }
    });
  }

  function resetBugReportGroup(group) {
    (group.bugReportFiles || []).forEach(function (entry) {
      if (entry.objectUrl) {
        URL.revokeObjectURL(entry.objectUrl);
      }
    });
    group.bugReportFiles = [];
    hideUploadTransfer(group);
    delete group.dataset.bugReportCommentId;
    delete group.dataset.bugReportLocked;
    group.querySelectorAll("textarea").forEach(function (textarea) {
      textarea.value = "";
    });
    group.querySelectorAll("input[type='file']").forEach(function (input) {
      input.value = "";
      input.disabled = false;
    });
    group.querySelectorAll("textarea, [data-bug-report-remove]").forEach(function (control) {
      control.disabled = false;
    });
    var fileName = group.querySelector("[data-bug-report-image-name]");
    if (fileName) {
      fileName.textContent = "可一次选择多个文件，单个文件不超过 100 MB。";
    }
    var list = group.querySelector("[data-composer-file-list]");
    if (list) {
      list.replaceChildren();
      list.hidden = true;
    }
  }

  function addBugReportGroup(form) {
    if (!form) {
      return;
    }
    var container = form.querySelector("[data-bug-report-groups]");
    var first = container && container.querySelector("[data-bug-report-group]");
    if (!container || !first) {
      return;
    }
    var clone = first.cloneNode(true);
    resetBugReportGroup(clone);
    container.appendChild(clone);
    updateBugReportGroupTitles(form);
    var textarea = clone.querySelector("[data-bug-report-body]");
    if (textarea) {
      textarea.focus({ preventScroll: true });
    }
  }

  function removeBugReportGroup(button) {
    var group = button.closest("[data-bug-report-group]");
    var form = button.closest("[data-bug-report-form]");
    if (
      !group ||
      !form ||
      group.dataset.bugReportLocked === "true" ||
      form.querySelectorAll("[data-bug-report-group]").length <= 1
    ) {
      return;
    }
    (group.bugReportFiles || []).forEach(function (entry) {
      if (entry.objectUrl) {
        URL.revokeObjectURL(entry.objectUrl);
      }
    });
    group.remove();
    updateBugReportGroupTitles(form);
  }

  function composerFileSignature(file) {
    return [file.name || "", file.size || 0, file.lastModified || 0].join(":");
  }

  function renderComposerFiles(group) {
    var list = group.querySelector("[data-composer-file-list]");
    var files = group.bugReportFiles || [];
    if (!list) {
      return;
    }
    list.replaceChildren();
    list.hidden = files.length === 0;
    files.forEach(function (entry) {
      var row = document.createElement("article");
      row.className = "composer-file";
      row.dataset.fileState = entry.uploaded ? "uploaded" : "ready";

      var media = document.createElement("button");
      media.className = "composer-file-media";
      media.type = "button";
      var isImage = isPreviewableImageType(entry.file.type);
      var isVideo = isPreviewableVideoType(entry.file.type);
      if ((isImage || isVideo) && !entry.objectUrl) {
        entry.objectUrl = URL.createObjectURL(entry.file);
      }
      if (isImage) {
        var image = document.createElement("img");
        image.src = entry.objectUrl;
        image.alt = entry.file.name || "本地图片";
        media.dataset.localImagePreview = "";
        media.dataset.imageSource = entry.objectUrl;
        media.dataset.imageTitle = entry.file.name || "本地图片";
        media.appendChild(image);
      } else if (isVideo) {
        var video = document.createElement("video");
        video.src = entry.objectUrl;
        video.muted = true;
        video.preload = "metadata";
        video.playsInline = true;
        media.dataset.localMediaPreview = "";
        media.dataset.mediaKind = "video";
        media.dataset.imageSource = entry.objectUrl;
        media.dataset.imageTitle = entry.file.name || "本地视频";
        media.setAttribute("aria-label", "预览视频 " + (entry.file.name || ""));
        media.appendChild(video);
      } else {
        media.disabled = true;
        var icon = document.createElement("span");
        icon.className = "composer-file-icon";
        icon.textContent = (entry.file.name.split(".").pop() || "FILE").slice(0, 5).toUpperCase();
        media.appendChild(icon);
      }

      var details = document.createElement("div");
      details.className = "composer-file-details";
      var name = document.createElement("strong");
      name.textContent = entry.file.name || "未命名文件";
      var meta = document.createElement("span");
      meta.textContent = (entry.file.type || "未知类型") + " · " + formatFileSize(entry.file.size);
      details.append(name, meta);

      var remove = document.createElement("button");
      remove.className = "composer-file-remove";
      remove.type = "button";
      remove.dataset.composerFileRemove = "";
      remove.dataset.fileSignature = entry.signature;
      remove.setAttribute("aria-label", "移除附件 " + (entry.file.name || ""));
      remove.textContent = "×";
      remove.disabled =
        entry.uploaded ||
        group.dataset.bugReportLocked === "true" ||
        group.dataset.discussionLocked === "true" ||
        group.dataset.uploadBusy === "true";
      row.append(media, details, remove);
      list.appendChild(row);
    });
  }

  function removeComposerFile(button) {
    var group = button.closest("[data-bug-report-group], [data-discussion-form], [data-direct-upload]");
    if (
      !group ||
      group.dataset.bugReportLocked === "true" ||
      group.dataset.discussionLocked === "true" ||
      group.dataset.uploadBusy === "true"
    ) {
      return;
    }
    var signature = button.dataset.fileSignature || "";
    group.bugReportFiles = (group.bugReportFiles || []).filter(function (entry) {
      if (entry.signature !== signature) {
        return true;
      }
      if (entry.objectUrl) {
        URL.revokeObjectURL(entry.objectUrl);
      }
      return false;
    });
    renderComposerFiles(group);
    if (group.matches("[data-direct-upload]")) {
      var directFiles = group.bugReportFiles || [];
      syncDirectUploadMetadata(group, directFiles.map(function (entry) { return entry.file; }));
      if (directFiles.length) {
        directUploadStatus(group, "已选择 " + directFiles.length + " 个文件，可继续添加或移除。", "ready");
        setUploadTransfer(group, 0, "准备上传", "共 " + directFiles.length + " 个文件等待提交。", "ready");
      } else {
        directUploadStatus(group, "等待选择文件。", "info");
        hideUploadTransfer(group);
      }
      return;
    }
    var label = group.querySelector("[data-bug-report-image-name], [data-discussion-file-hint]");
    if (label) {
      label.textContent = group.bugReportFiles.length
        ? "已选择 " + group.bugReportFiles.length + " 个附件，可继续添加。"
        : group.matches("[data-discussion-form]")
          ? "支持多个文件，图片和视频可预览"
          : "可一次选择多个文件，单个文件不超过 100 MB。";
    }
  }

  function syncBugReportImageName(input) {
    var group = input.closest("[data-bug-report-group]");
    var selected = input.files ? Array.from(input.files) : [];
    var label = group && group.querySelector("[data-bug-report-image-name]");
    if (!group || !label) {
      return;
    }
    var files = group.bugReportFiles || [];
    var signatures = new Set(files.map(function (entry) { return entry.signature; }));
    selected.forEach(function (file) {
      var signature = composerFileSignature(file);
      if (!signatures.has(signature)) {
        files.push({ file: file, signature: signature, attachmentId: "", uploaded: false, objectUrl: "" });
        signatures.add(signature);
      }
    });
    group.bugReportFiles = files;
    input.value = "";
    renderComposerFiles(group);
    label.textContent = files.length
      ? "已选择 " + files.length + " 个附件，可继续添加。"
      : "可一次选择多个文件，单个文件不超过 100 MB。";
    if (files.length) {
      setUploadTransfer(group, 0, "准备上传附件", "共 " + files.length + " 个文件等待提交。", "ready");
    } else {
      hideUploadTransfer(group);
    }
  }

  function discussionStatus(form, message, tone) {
    var status = form.querySelector("[data-discussion-status]");
    setStatusMessage(status, message, tone);
  }

  function isDiscussionControlLocked(form, control) {
    if (!form || !control) {
      return false;
    }
    if (
      form.dataset.discussionLocked === "true" &&
      control.matches("[data-discussion-body], [data-discussion-files], [data-composer-file-remove], [data-discussion-reply-cancel]")
    ) {
      return true;
    }
    if (
      form.dataset.discussionLocked === "true" &&
      form.dataset.discussionPendingAssign !== "true" &&
      control.matches("[data-discussion-assign]")
    ) {
      return true;
    }
    if (form.dataset.discussionAssignmentComplete === "true") {
      if (control.matches("[data-discussion-assign-status]")) {
        return true;
      }
      var selectControl = control.closest && control.closest(".select-control");
      return Boolean(
        selectControl &&
        selectControl.selectElement &&
        selectControl.selectElement.matches("[data-discussion-assign-status]")
      );
    }
    return false;
  }

  function syncDiscussionFiles(input) {
    var form = input.closest("[data-discussion-form]");
    if (!form || form.dataset.discussionLocked === "true") {
      return;
    }
    var files = form.bugReportFiles || [];
    var signatures = new Set(files.map(function (entry) { return entry.signature; }));
    Array.from(input.files || []).forEach(function (file) {
      var signature = composerFileSignature(file);
      if (!signatures.has(signature)) {
        files.push({ file: file, signature: signature, attachmentId: "", uploaded: false, objectUrl: "" });
        signatures.add(signature);
      }
    });
    form.bugReportFiles = files;
    input.value = "";
    renderComposerFiles(form);
    var hint = form.querySelector("[data-discussion-file-hint]");
    if (hint) {
      hint.textContent = files.length
        ? "已选择 " + files.length + " 个附件，可继续添加"
        : "支持多个文件，图片和视频可预览";
    }
    if (files.length) {
      setUploadTransfer(form, 0, "附件等待上传", "发表内容后开始上传 " + files.length + " 个文件。", "ready");
    } else {
      hideUploadTransfer(form);
    }
  }

  function setDiscussionBusy(form, busy, activeSubmitter) {
    form.dataset.discussionBusy = busy ? "true" : "false";
    form.querySelectorAll("button, textarea, input, select").forEach(function (control) {
      control.disabled = busy || isDiscussionControlLocked(form, control);
    });
    form.querySelectorAll("[data-rich-text-input]").forEach(function (input) {
      input.setAttribute("contenteditable", busy ? "false" : "true");
    });
    form.querySelectorAll("[data-discussion-submit]").forEach(function (button) {
      if (!button.dataset.originalLabel) {
        button.dataset.originalLabel = button.textContent.trim();
      }
      button.textContent = busy && button === activeSubmitter
        ? "正在提交..."
        : button.dataset.originalLabel;
    });
  }

  async function submitDiscussion(form, submitter) {
    if (form.dataset.discussionBusy === "true") {
      return;
    }
    if (!syncRichTextForm(form) || !form.reportValidity()) {
      return;
    }
    var itemKey = form.dataset.itemKey || "";
    var bodyInput = form.querySelector("[data-discussion-body]");
    var bodyFormatInput = form.querySelector("[data-discussion-body-format]");
    var parentInput = form.querySelector("input[name='parent_comment_id']");
    var files = form.bugReportFiles || [];
    var submit = submitter && submitter.matches("[data-discussion-submit]")
      ? submitter
      : form.querySelector("[data-discussion-submit]");
    var shouldAssign =
      form.dataset.discussionPendingAssign === "true" ||
      Boolean(submitter && submitter.matches("[data-discussion-assign]"));
    if (shouldAssign) {
      form.dataset.discussionPendingAssign = "true";
    }
    setDiscussionBusy(form, true, submit);
    try {
      var commentId = form.dataset.discussionCommentId || "";
      if (commentId && form.dataset.discussionDraft === "true") {
        discussionStatus(form, "正在发布内容...", "info");
        await fetchJson(
          "/api/v1/work-items/" + encodeURIComponent(itemKey) + "/comments/" + encodeURIComponent(commentId) + "/publish",
          {
            method: "POST",
            headers: { "content-type": "application/json", accept: "application/json" },
            body: JSON.stringify({
              body: bodyInput ? bodyInput.value.trim() : "",
              body_format: bodyFormatInput ? bodyFormatInput.value : "html",
            }),
          }
        );
        delete form.dataset.discussionDraft;
        form.dataset.discussionLocked = "true";
      } else if (!commentId) {
        discussionStatus(form, "正在发表内容...", "info");
        var comment = await fetchJson(
          "/api/v1/work-items/" + encodeURIComponent(itemKey) + "/comments",
          {
            method: "POST",
            headers: { "content-type": "application/json", accept: "application/json" },
            body: JSON.stringify({
              body: bodyInput ? bodyInput.value.trim() : "",
              body_format: bodyFormatInput ? bodyFormatInput.value : "html",
              parent_comment_id: parentInput && parentInput.value
                ? Number(parentInput.value)
                : null,
            }),
          }
        );
        commentId = String(comment.id);
        form.dataset.discussionCommentId = commentId;
        form.dataset.discussionLocked = "true";
      }

      if (
        shouldAssign &&
        form.dataset.discussionAssignmentComplete !== "true"
      ) {
        var assignTarget = form.dataset.assignTarget || "";
        var assignStatus = form.querySelector("[data-discussion-assign-status]");
        if (!assignTarget) {
          throw new Error("无法识别指派对象，请刷新页面后重试。");
        }
        discussionStatus(form, "正在更新指派和状态...", "info");
        await fetchJson(
          "/api/v1/work-items/" + encodeURIComponent(itemKey) + "/handoff",
          {
            method: "POST",
            headers: { "content-type": "application/json", accept: "application/json" },
            body: JSON.stringify({
              status: assignStatus ? assignStatus.value : "",
              assignee_username: assignTarget,
              body: "由讨论内容自动指派",
              source_comment_id: Number(commentId),
            }),
          }
        );
        form.dataset.discussionAssignmentComplete = "true";
        delete form.dataset.discussionPendingAssign;
      }

      for (var index = 0; index < files.length; index += 1) {
        var entry = files[index];
        if (entry.uploaded) {
          continue;
        }
        var fileNumber = index + 1;
        var fileCount = files.length;
        discussionStatus(form, "正在上传附件 " + fileNumber + "/" + fileCount + "...", "info");
        await uploadAttachmentFile({
          file: entry.file,
          filename: entry.file.name || "attachment.bin",
          contentType: entry.file.type || "application/octet-stream",
          byteSize: entry.file.size || 0,
          existingAttachmentId: entry.attachmentId,
          createUrl:
            "/api/v1/work-items/" + encodeURIComponent(itemKey) +
            "/comments/" + encodeURIComponent(commentId) + "/attachments",
          uploadUrl: function (attachmentId) {
            return attachmentUrlForComment(itemKey, commentId, attachmentId, "upload-url");
          },
          completeUrl: function (attachmentId) {
            return attachmentUrlForComment(itemKey, commentId, attachmentId, "uploaded");
          },
          onAttachmentReady: function (attachment) {
            entry.attachmentId = String(attachment.id);
          },
          onStage: function (stage) {
            var base = (index / fileCount) * 100;
            if (stage === "signing") {
              setUploadTransfer(form, base, "准备附件 " + fileNumber + "/" + fileCount, "正在获取上传签名。", "info");
            } else if (stage === "uploading") {
              setUploadTransfer(form, base, "上传附件 " + fileNumber + "/" + fileCount, entry.file.name, "info");
            } else if (stage === "finalizing") {
              setUploadTransfer(form, (fileNumber / fileCount) * 100, "确认附件", "正在保存上传结果。", "info");
            }
          },
          onProgress: function (percent) {
            var overall = typeof percent === "number"
              ? ((index + percent / 100) / fileCount) * 100
              : null;
            setUploadTransfer(form, overall, "上传附件 " + fileNumber + "/" + fileCount, entry.file.name, "info");
          },
        });
        entry.uploaded = true;
        renderComposerFiles(form);
      }

      if (files.length) {
        setUploadTransfer(form, 100, "附件上传完成", files.length + " 个文件已全部保存。", "success");
      }
      discussionStatus(form, "发表成功，正在定位讨论...", "success");
      queueSuccessBeforeNavigation("内容已发表。");
      window.setTimeout(function () {
        reloadDiscussionAtComment(itemKey, commentId);
      }, 350);
    } catch (error) {
      var errorMessage = (error && error.message) || "提交失败，请重试。";
      if (form.dataset.discussionCommentId) {
        errorMessage = form.dataset.discussionDraft === "true"
          ? "草稿和已上传文件已保留，可直接重试。" + errorMessage
          : "内容已发表，未完成的指派或附件可直接重试。" + errorMessage;
      }
      discussionStatus(form, errorMessage, "error");
      setDiscussionBusy(form, false);
    }
  }

  function collectBugReportGroups(form) {
    return Array.from(form.querySelectorAll("[data-bug-report-group]"))
      .map(function (group, index) {
        var body = (group.querySelector("[data-bug-report-body]")?.value || "").trim();
        return { index: index, element: group, files: group.bugReportFiles || [], body: body };
      })
      .filter(function (group) {
        return Boolean(group.files.length || group.body);
      });
  }

  function syncBugReportRichDescription(form) {
    var editor = richTextEditorForForm(form);
    var description = form.querySelector("[data-bug-report-description]");
    if (!editor || !description) {
      return;
    }
    var plainText = richTextPlainText(editor);
    if (!plainText && editor.querySelector("[data-rich-attachment]")) {
      plainText = "见首条图文说明";
    }
    description.value = plainText.length > 5000
      ? plainText.slice(0, 4990) + "..."
      : plainText;
  }

  async function publishBugReportRichText(form, item) {
    var editor = richTextEditorForForm(form);
    if (!editor || !richTextEditorHasUserContent(editor)) {
      return null;
    }
    if (editor.querySelector("[data-rich-attachment][data-upload-state='uploading']")) {
      throw new Error("文件仍在上传，请等待完成后再提交。");
    }
    var itemKey = item && item.key ? String(item.key) : "";
    if (!itemKey) {
      throw new Error("工作项创建结果缺少编号，请刷新后重试。");
    }
    editor.dataset.itemKey = itemKey;
    var attachments = Array.from(editor.querySelectorAll("[data-rich-attachment]"));
    var useDraft = Boolean(editor.dataset.commentId || attachments.length);
    var commentId = "";

    if (useDraft) {
      bugReportStatus(form, "正在准备帖子正文...", "info");
      commentId = await ensureDiscussionDraft(editor);
      for (var index = 0; index < attachments.length; index += 1) {
        var node = attachments[index];
        if (node.dataset.uploadState === "uploaded") {
          continue;
        }
        if (!node.richFile) {
          throw new Error("附件文件已失效，请移除后重新选择。");
        }
        bugReportStatus(
          form,
          "正在上传图文附件 " + (index + 1) + "/" + attachments.length + "...",
          "info"
        );
        await uploadRichAttachment(editor, node, node.richFile, { throwOnError: true });
      }
    }

    var body = serializeRichTextEditor(editor);
    if (richTextIsEmptyHtml(body)) {
      return null;
    }
    if (useDraft) {
      bugReportStatus(form, "正在发布帖子正文...", "info");
      return fetchJson(
        "/api/v1/work-items/" +
          encodeURIComponent(itemKey) +
          "/comments/" +
          encodeURIComponent(commentId) +
          "/publish",
        {
          method: "POST",
          headers: { "content-type": "application/json", accept: "application/json" },
          body: JSON.stringify({ body: body, body_format: "html" }),
        }
      );
    }

    bugReportStatus(form, "正在保存帖子正文...", "info");
    return fetchJson("/api/v1/work-items/" + encodeURIComponent(itemKey) + "/comments", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ body: body, body_format: "html" }),
    });
  }

  function isBugReportControlLocked(form, control) {
    if (
      form.dataset.bugReportItemKey &&
      control.matches("[data-bug-report-immutable]")
    ) {
      return true;
    }
    var group = control.closest("[data-bug-report-group][data-bug-report-locked='true']");
    return Boolean(
      group && control.matches("[data-bug-report-image], [data-bug-report-body], [data-bug-report-remove], [data-composer-file-remove]")
    );
  }

  function applyBugReportPersistedLocks(form) {
    form.querySelectorAll("input, select, textarea, button").forEach(function (control) {
      if (control.matches("[data-modal-close]")) {
        return;
      }
      if (isBugReportControlLocked(form, control)) {
        control.disabled = true;
      }
    });
  }

  function bugReportSuccessUrl(form, item) {
    var redirect = form.dataset.successRedirect || "";
    if (redirect) {
      return redirect.replace("{key}", encodeURIComponent(item.key || ""));
    }
    return "/web/work-items/" + encodeURIComponent(item.key);
  }

  async function submitBugReport(form) {
    if (form.dataset.bugReportBusy === "true") {
      return;
    }
    syncBugReportRichDescription(form);
    if (!form.reportValidity()) {
      return;
    }
    var groups = collectBugReportGroups(form);
    var itemLabel = form.dataset.workItemLabel || "工作项";
    setBugReportBusy(form, true);
    try {
      var item = await ensureBugReportItemSaved(form);

      await publishBugReportRichText(form, item);

      for (var i = 0; i < groups.length; i += 1) {
        var group = groups[i];
        var comment = { id: group.element.dataset.bugReportCommentId || "" };
        if (!comment.id) {
          bugReportStatus(form, "正在创建第 " + (i + 1) + "/" + groups.length + " 组说明...", "info");
          var commentBody = group.body ||
            "附件：" + group.files.map(function (entry) { return entry.file.name || "未命名文件"; }).join("、");
          comment = await fetchJson("/api/v1/work-items/" + encodeURIComponent(item.key) + "/comments", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              accept: "application/json",
            },
            body: JSON.stringify({ body: commentBody }),
          });
          group.element.dataset.bugReportCommentId = String(comment.id);
          group.element.dataset.bugReportLocked = "true";
          applyBugReportPersistedLocks(form);
        }

        for (var fileIndex = 0; fileIndex < group.files.length; fileIndex += 1) {
          var fileEntry = group.files[fileIndex];
          if (fileEntry.uploaded) {
            continue;
          }
          var fileNumber = fileIndex + 1;
          var fileCount = group.files.length;
          bugReportStatus(
            form,
            "正在上传第 " + (i + 1) + "/" + groups.length + " 组附件（" + fileNumber + "/" + fileCount + "）...",
            "info"
          );
          await uploadAttachmentFile({
            file: fileEntry.file,
            filename: fileEntry.file.name || "attachment.bin",
            contentType: fileEntry.file.type || "application/octet-stream",
            byteSize: fileEntry.file.size || 0,
            existingAttachmentId: fileEntry.attachmentId,
            createUrl:
              "/api/v1/work-items/" +
              encodeURIComponent(item.key) +
              "/comments/" +
              encodeURIComponent(String(comment.id)) +
              "/attachments",
            uploadUrl: function (attachmentId) {
              return attachmentUrlForComment(item.key, comment.id, attachmentId, "upload-url");
            },
            completeUrl: function (attachmentId) {
              return attachmentUrlForComment(item.key, comment.id, attachmentId, "uploaded");
            },
            onAttachmentReady: function (attachment) {
              fileEntry.attachmentId = String(attachment.id);
            },
            onStage: function (stage) {
              var completedPercent = (fileIndex / fileCount) * 100;
              if (stage === "signing") {
                setUploadTransfer(group.element, completedPercent, "正在获取上传签名", "附件 " + fileNumber + "/" + fileCount + " 已登记。", "info");
              } else if (stage === "uploading") {
                setUploadTransfer(group.element, completedPercent, "正在上传附件", "附件 " + fileNumber + "/" + fileCount + " 正在直传。", "info");
              } else if (stage === "finalizing") {
                setUploadTransfer(group.element, (fileNumber / fileCount) * 100, "正在确认附件", "正在更新附件状态。", "info");
              }
            },
            onProgress: function (percent) {
              if (typeof percent === "number") {
                var overall = ((fileIndex + percent / 100) / fileCount) * 100;
                setUploadTransfer(group.element, overall, "正在上传附件", "附件 " + fileNumber + "/" + fileCount + " 已传输 " + Math.round(percent) + "% 。", "info");
              } else {
                setUploadTransfer(group.element, null, "正在上传附件", "浏览器未提供可计算的传输长度。", "info");
              }
            },
          });
          fileEntry.uploaded = true;
          renderComposerFiles(group.element);
        }
        if (group.files.length) {
          setUploadTransfer(group.element, 100, "附件上传完成", "第 " + (i + 1) + " 组共 " + group.files.length + " 个附件已完成。", "success");
        }
      }

      bugReportStatus(form, itemLabel + "创建完成，正在打开结果页。", "success");
      queueSuccessBeforeNavigation(itemLabel + "创建完成。");
      window.setTimeout(function () {
        window.location.href = bugReportSuccessUrl(form, item);
      }, 450);
    } catch (error) {
      bugReportStatus(form, error.message || itemLabel + "创建失败，请稍后重试。", "error");
      setBugReportBusy(form, false);
    }
  }

  async function submitProjectResource(form) {
    if (form.dataset.resourceBusy === "true") {
      return;
    }
    if (!form.reportValidity()) {
      return;
    }
    var editor = richTextEditorForForm(form);
    if (!editor || !richTextEditorHasUserContent(editor)) {
      resourceStatus(form, "资料正文不能为空。", "error");
      richTextInput(editor)?.focus({ preventScroll: true });
      return;
    }
    if (editor.querySelector("[data-rich-attachment][data-upload-state='uploading']")) {
      resourceStatus(form, "文件仍在上传，请等待完成后再保存。", "error");
      return;
    }
    if (editor.querySelector("[data-rich-attachment][data-upload-state='error']")) {
      resourceStatus(form, "有文件上传失败，请重试或移除失败项后再保存。", "error");
      return;
    }

    var formData = new FormData(form);
    var projectKey = form.dataset.resourceProjectKey || "";
    var resourceId = form.dataset.resourceId || "";
    setResourceBusy(form, true);
    try {
      if (!resourceId) {
        var created = await ensureProjectResourceForRichUpload(editor);
        resourceId = created && created.id ? String(created.id) : "";
      } else {
        applyResourceContext(form, resourceId, projectKey);
      }

      var attachments = Array.from(editor.querySelectorAll("[data-rich-attachment]"));
      for (var index = 0; index < attachments.length; index += 1) {
        var node = attachments[index];
        if (node.dataset.uploadState === "uploaded") {
          continue;
        }
        if (!node.richFile) {
          throw new Error("附件文件已失效，请移除后重新选择。");
        }
        resourceStatus(form, "正在上传资料附件 " + (index + 1) + "/" + attachments.length + "...", "info");
        await uploadRichAttachment(editor, node, node.richFile, { throwOnError: true });
      }

      var body = serializeRichTextEditor(editor);
      if (richTextIsEmptyHtml(body)) {
        throw new Error("资料正文不能为空。");
      }
      var bodyInput = form.querySelector("[data-resource-body]");
      var formatInput = form.querySelector("[data-resource-body-format]");
      if (bodyInput) {
        bodyInput.value = body;
      }
      if (formatInput) {
        formatInput.value = "html";
      }
      resourceStatus(form, "正在保存资料正文...", "info");
      var saved = await fetchJson(
        form.dataset.resourceUpdateUrl ||
          ("/api/v1/projects/" +
            encodeURIComponent(projectKey) +
            "/resources/" +
            encodeURIComponent(resourceId)),
        {
          method: "PATCH",
          headers: { "content-type": "application/json", accept: "application/json" },
          body: JSON.stringify({
            title: formData.get("title") || "",
            category: formData.get("category") || "other",
            body: body,
            body_format: "html",
          }),
        }
      );
      resourceStatus(form, "资料已保存。", "success");
      queueSuccessBeforeNavigation("资料已保存。");
      var redirectTemplate =
        form.dataset.successRedirectTemplate ||
        "/web/projects/" + encodeURIComponent(projectKey) + "/resources/{id}";
      window.setTimeout(function () {
        window.location.href = redirectTemplate.replace(
          "{id}",
          encodeURIComponent(String(saved.id || resourceId))
        );
      }, 300);
    } catch (error) {
      resourceStatus(form, error.message || "资料保存失败，请重试。", "error");
      setResourceBusy(form, false);
    }
  }

  function setAttachmentImageState(preview, state, message) {
    var image = preview.querySelector("[data-image-preview-image]");
    var status = preview.querySelector("[data-image-preview-status]");
    preview.dataset.imagePreviewState = state;
    if (image) {
      image.hidden = state !== "ready";
    }
    if (status) {
      status.textContent = message;
      status.setAttribute("role", "status");
      status.setAttribute("aria-live", "polite");
    }
  }

  function refreshedImageSource(source) {
    if (!source || source.indexOf("blob:") === 0) {
      return source;
    }
    return source + (source.indexOf("?") >= 0 ? "&" : "?") + "preview=" + Date.now();
  }

  function loadAttachmentImage(preview, retry) {
    if (!preview) {
      return Promise.reject(new Error("图片预览不可用。"));
    }
    if (!retry && preview.dataset.imagePreviewState === "ready") {
      return Promise.resolve(preview.querySelector("[data-image-preview-image]"));
    }
    if (!retry && preview.imageLoadPromise) {
      return preview.imageLoadPromise;
    }

    var image = preview.querySelector("[data-image-preview-image]");
    var source = preview.dataset.imageSource || "";
    if (!image || !source) {
      setAttachmentImageState(preview, "error", "图片预览不可用，点击重试。");
      return Promise.reject(new Error("图片预览缺少来源。"));
    }

    setAttachmentImageState(preview, "loading", "正在加载图片预览。");
    var requestSource = retry ? refreshedImageSource(source) : source;
    var promise = new Promise(function (resolve, reject) {
      image.onload = function () {
        image.onload = null;
        image.onerror = null;
        preview.imageLoadPromise = null;
        setAttachmentImageState(preview, "ready", "点击查看大图。");
        resolve(image);
      };
      image.onerror = function () {
        image.onload = null;
        image.onerror = null;
        preview.imageLoadPromise = null;
        setAttachmentImageState(preview, "error", "图片加载失败，点击重试。");
        reject(new Error("图片加载失败。"));
      };
      image.src = requestSource;
    });
    preview.imageLoadPromise = promise;
    return promise;
  }

  function observeAttachmentImage(preview) {
    if (!("IntersectionObserver" in window)) {
      loadAttachmentImage(preview, false).catch(function () {});
      return;
    }
    if (!imagePreviewObserver) {
      imagePreviewObserver = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (!entry.isIntersecting) {
              return;
            }
            imagePreviewObserver.unobserve(entry.target);
            loadAttachmentImage(entry.target, false).catch(function () {});
          });
        },
        { rootMargin: "180px 0px" }
      );
    }
    imagePreviewObserver.observe(preview);
  }

  function loadVisibleAttachmentImages() {
    document.querySelectorAll("[data-image-preview][data-image-preview-state='idle']").forEach(function (preview) {
      var rect = preview.getBoundingClientRect();
      if (rect.bottom < -180 || rect.top > window.innerHeight + 180) {
        return;
      }
      if (imagePreviewObserver) {
        imagePreviewObserver.unobserve(preview);
      }
      loadAttachmentImage(preview, false).catch(function () {});
    });
  }

  function scheduleVisibleAttachmentImageChecks() {
    if (imagePreviewFallbackTimer) {
      return;
    }
    var attempts = 0;
    var check = function () {
      imagePreviewFallbackTimer = null;
      loadVisibleAttachmentImages();
      attempts += 1;
      if (
        attempts < 30 &&
        document.querySelector("[data-image-preview][data-image-preview-state='idle']")
      ) {
        imagePreviewFallbackTimer = window.setTimeout(check, 500);
      }
    };
    imagePreviewFallbackTimer = window.setTimeout(check, 120);
  }

  function initAttachmentImagePreviews(root) {
    var scope = root || document;
    var previews = [];
    if (scope.matches && scope.matches("[data-image-preview]")) {
      previews.push(scope);
    }
    if (scope.querySelectorAll) {
      previews = previews.concat(Array.from(scope.querySelectorAll("[data-image-preview]")));
    }
    previews.forEach(function (preview) {
      if (preview.dataset.imagePreviewInitialized === "true") {
        return;
      }
      preview.dataset.imagePreviewInitialized = "true";
      setAttachmentImageState(preview, "idle", "等待加载图片预览。");
      observeAttachmentImage(preview);
    });
    scheduleVisibleAttachmentImageChecks();
  }

  function applyDiscussionRichImageOrientation(image) {
    if (!image) {
      return;
    }
    var orientation = mediaOrientation(image.naturalWidth, image.naturalHeight);
    if (!orientation) {
      return;
    }
    image.dataset.yuanceOrientation = orientation;
    var width = inlineMediaWidth(orientation, image.naturalWidth, 420, 520);
    if (width > 0) {
      setStyleProperty(image, "--yuance-media-inline-width", width + "px");
    }
    var figure = image.closest("figure[data-yuance-attachment-kind='image']");
    if (figure) {
      figure.dataset.yuanceOrientation = orientation;
      if (width > 0) {
        setStyleProperty(figure, "--yuance-media-inline-width", width + "px");
      }
    }
  }

  function bindDiscussionRichImageOrientation(image) {
    if (!image || image.dataset.yuanceOrientationBound === "true") {
      return;
    }
    image.dataset.yuanceOrientationBound = "true";
    var apply = function () {
      applyDiscussionRichImageOrientation(image);
    };
    image.addEventListener("load", apply, { once: true });
    if (image.complete && image.naturalWidth) {
      apply();
    }
  }

  function initDiscussionRichMedia(root) {
    var scope = root || document;
    var images = [];
    if (scope.matches && scope.matches(".discussion-rich-body img")) {
      images.push(scope);
    }
    if (scope.querySelectorAll) {
      images = images.concat(Array.from(scope.querySelectorAll(".discussion-rich-body img")));
    }
    images.forEach(function (image) {
      bindDiscussionRichImageOrientation(image);
    });
  }

  function imageViewerModal() {
    return document.querySelector("[data-image-viewer]");
  }

  function suspendModalForImageViewer(modal) {
    if (!modal || modal.imageViewerSuspended) {
      return;
    }
    modal.imageViewerSuspended = true;
    modal.imageViewerPreviousAriaHidden = modal.getAttribute("aria-hidden");
    modal.imageViewerWasInert = modal.inert;
    modal.imageViewerWasVisible = !modal.hidden;
    if (modal.modalOpenFrame) {
      window.cancelAnimationFrame(modal.modalOpenFrame);
      modal.modalOpenFrame = null;
    }
    if (modal.modalOpenTimer) {
      window.clearTimeout(modal.modalOpenTimer);
      modal.modalOpenTimer = null;
    }
    modal.setAttribute("aria-hidden", "true");
    modal.setAttribute("inert", "");
    modal.inert = true;
  }

  function restoreModalFromImageViewer(modal) {
    if (!modal || !modal.imageViewerSuspended) {
      return;
    }
    if (modal.imageViewerPreviousAriaHidden === null) {
      modal.removeAttribute("aria-hidden");
    } else {
      modal.setAttribute("aria-hidden", modal.imageViewerPreviousAriaHidden);
    }
    if (modal.imageViewerWasInert) {
      modal.setAttribute("inert", "");
      modal.inert = true;
    } else {
      modal.removeAttribute("inert");
      modal.inert = false;
    }
    if (modal.imageViewerWasVisible) {
      modal.hidden = false;
      modal.classList.add("open");
    }
    delete modal.imageViewerSuspended;
    delete modal.imageViewerPreviousAriaHidden;
    delete modal.imageViewerWasInert;
    delete modal.imageViewerWasVisible;
  }

  function imageViewerEntrySource(entry) {
    return entry && entry.dataset ? entry.dataset.imageSource || "" : "";
  }

  function imageViewerEntryTitle(entry) {
    return entry && entry.dataset ? entry.dataset.imageTitle || "媒体预览" : "媒体预览";
  }

  function imageViewerEntryKind(entry) {
    return entry && entry.dataset && entry.dataset.mediaKind === "video" ? "video" : "image";
  }

  function imageViewerEntriesFor(preview) {
    var gallery = preview.dataset.imageGallery || "";
    if (!gallery) {
      return [preview];
    }
    var entries = Array.from(document.querySelectorAll("[data-image-preview], [data-media-preview]")).filter(function (item) {
      return item.dataset.imageGallery === gallery && !item.closest("[hidden]");
    });
    return entries.length > 0 ? entries : [preview];
  }

  function imageViewerStage() {
    return document.querySelector("[data-image-viewer-stage]");
  }

  function imageViewerPan() {
    return document.querySelector("[data-image-viewer-pan]");
  }

  function imageViewerImage() {
    return document.querySelector("[data-image-viewer-image]");
  }

  function normalizeImageViewerScale(value) {
    return Math.round(value * 100) / 100;
  }

  function resetImageViewerEntryState(kind) {
    imageViewerState.dragging = false;
    imageViewerState.pointerId = null;
    imageViewerState.scale = 1;
    imageViewerState.defaultScale = 1;
    imageViewerState.minScale = 1;
    imageViewerState.maxScale = 4;
    imageViewerState.rotation = 0;
    imageViewerState.translateX = 0;
    imageViewerState.translateY = 0;
    imageViewerState.kind = kind || "image";
    imageViewerState.orientation = "";
  }

  function imageViewerStageViewport(stage) {
    if (!stage) {
      return { width: 0, height: 0 };
    }
    var styles = window.getComputedStyle(stage);
    var paddingLeft = parseFloat(styles.paddingLeft || "0");
    var paddingRight = parseFloat(styles.paddingRight || "0");
    var paddingTop = parseFloat(styles.paddingTop || "0");
    var paddingBottom = parseFloat(styles.paddingBottom || "0");
    return {
      width: Math.max(0, stage.clientWidth - paddingLeft - paddingRight),
      height: Math.max(0, stage.clientHeight - paddingTop - paddingBottom),
    };
  }

  function imageViewerCanPan() {
    return imageViewerState.kind === "image" && (
      imageViewerState.scale > 1.01 ||
      imageViewerState.defaultScale > 1.01 ||
      Math.abs(imageViewerState.rotation % 180) > 0.01
    );
  }

  function imageViewerRenderedBounds() {
    var image = imageViewerImage();
    var stage = imageViewerStage();
    if (!image || image.hidden || !stage || !image.offsetWidth || !image.offsetHeight) {
      return { maxX: 0, maxY: 0 };
    }
    var viewport = imageViewerStageViewport(stage);
    var radians = (Math.abs(imageViewerState.rotation % 360) * Math.PI) / 180;
    var width = image.offsetWidth * imageViewerState.scale;
    var height = image.offsetHeight * imageViewerState.scale;
    var sin = Math.abs(Math.sin(radians));
    var cos = Math.abs(Math.cos(radians));
    var rotatedWidth = width * cos + height * sin;
    var rotatedHeight = width * sin + height * cos;
    return {
      maxX: Math.max(0, (rotatedWidth - viewport.width) / 2),
      maxY: Math.max(0, (rotatedHeight - viewport.height) / 2),
    };
  }

  function clampImageViewerTranslation() {
    var bounds = imageViewerRenderedBounds();
    imageViewerState.translateX = clampNumber(imageViewerState.translateX, -bounds.maxX, bounds.maxX);
    imageViewerState.translateY = clampNumber(imageViewerState.translateY, -bounds.maxY, bounds.maxY);
    if (bounds.maxX === 0) {
      imageViewerState.translateX = 0;
    }
    if (bounds.maxY === 0) {
      imageViewerState.translateY = 0;
    }
  }

  function updateImageViewerStatus() {
    var modal = imageViewerModal();
    var status = modal && modal.querySelector("[data-image-viewer-status]");
    if (!status) {
      return;
    }
    var prefix = imageViewerState.entries.length > 1
      ? "第 " + (imageViewerState.index + 1) + " / " + imageViewerState.entries.length + " 项"
      : "";
    if (imageViewerState.kind === "video") {
      status.textContent = prefix ? prefix + " · 视频预览" : "视频预览";
      return;
    }
    var hint = imageViewerState.orientation === "portrait"
      ? "竖图已优化放大，可拖动查看细节。"
      : "滚轮缩放，双击快速放大或重置。";
    status.textContent = prefix ? prefix + " · " + hint : hint;
  }

  function applyImageViewerTransform() {
    var image = imageViewerImage();
    var pan = imageViewerPan();
    if (!image || !pan) {
      return;
    }
    clampImageViewerTranslation();
    pan.style.transform = "translate3d(" + imageViewerState.translateX + "px, " + imageViewerState.translateY + "px, 0)";
    pan.dataset.draggable = imageViewerCanPan() ? "true" : "false";
    pan.classList.toggle("dragging", imageViewerState.dragging && imageViewerCanPan());
    image.style.transform = "scale(" + imageViewerState.scale + ") rotate(" + imageViewerState.rotation + "deg)";
  }

  function preferredImageViewerScale(orientation, viewportWidth, viewportHeight, renderedWidth, renderedHeight) {
    if (
      orientation !== "portrait" ||
      !viewportWidth ||
      !viewportHeight ||
      !renderedWidth ||
      !renderedHeight
    ) {
      return 1;
    }
    var targetWidth = Math.min(viewportWidth, Math.max(Math.min(viewportWidth * 0.7, 760), 320));
    var maxHeight = viewportHeight * 1.65;
    var widthScale = targetWidth / renderedWidth;
    var heightScale = maxHeight / renderedHeight;
    return normalizeImageViewerScale(clampNumber(Math.min(widthScale, heightScale, 2.35), 1, 2.35));
  }

  function syncImageViewerImageLayout(image, forceResetScale) {
    var modal = imageViewerModal();
    var stage = imageViewerStage();
    if (
      !image ||
      !stage ||
      !modal ||
      image.hidden ||
      modal.hidden ||
      imageViewerState.kind !== "image" ||
      !image.naturalWidth ||
      !image.naturalHeight
    ) {
      return;
    }
    if (!image.offsetWidth || !image.offsetHeight) {
      window.requestAnimationFrame(function () {
        syncImageViewerImageLayout(image, forceResetScale);
      });
      return;
    }
    var previousDefault = imageViewerState.defaultScale || 1;
    var viewport = imageViewerStageViewport(stage);
    var orientation = mediaOrientation(image.naturalWidth, image.naturalHeight);
    var nextDefaultScale = preferredImageViewerScale(
      orientation,
      viewport.width,
      viewport.height,
      image.offsetWidth,
      image.offsetHeight
    );
    imageViewerState.orientation = orientation;
    imageViewerState.defaultScale = nextDefaultScale;
    if (forceResetScale || Math.abs(imageViewerState.scale - previousDefault) < 0.01) {
      imageViewerState.scale = nextDefaultScale;
      imageViewerState.translateX = 0;
      imageViewerState.translateY = 0;
    } else {
      imageViewerState.scale = clampNumber(imageViewerState.scale, imageViewerState.minScale, imageViewerState.maxScale);
    }
    applyImageViewerTransform();
    updateImageViewerStatus();
  }

  function refreshImageViewerLayout() {
    var image = imageViewerImage();
    if (!image || image.hidden || imageViewerState.kind !== "image") {
      return;
    }
    syncImageViewerImageLayout(image, Math.abs(imageViewerState.scale - imageViewerState.defaultScale) < 0.01);
  }

  function setImageViewerScale(nextScale) {
    if (imageViewerState.kind !== "image") {
      return;
    }
    imageViewerState.scale = normalizeImageViewerScale(
      clampNumber(nextScale, imageViewerState.minScale, imageViewerState.maxScale)
    );
    applyImageViewerTransform();
  }

  function stopImageViewerDrag() {
    var stage = imageViewerStage();
    if (stage && imageViewerState.pointerId !== null && typeof stage.releasePointerCapture === "function") {
      try {
        stage.releasePointerCapture(imageViewerState.pointerId);
      } catch (_error) {
        // Pointer capture may already be released.
      }
    }
    imageViewerState.dragging = false;
    imageViewerState.pointerId = null;
    var pan = imageViewerPan();
    if (pan) {
      pan.classList.remove("dragging");
    }
  }

  function beginImageViewerDrag(event) {
    if (
      imageViewerState.kind !== "image" ||
      !imageViewerCanPan() ||
      (typeof event.button === "number" && event.button !== 0)
    ) {
      return;
    }
    var stage = imageViewerStage();
    if (!stage) {
      return;
    }
    imageViewerState.dragging = true;
    imageViewerState.pointerId = event.pointerId;
    imageViewerState.pointerStartX = event.clientX;
    imageViewerState.pointerStartY = event.clientY;
    imageViewerState.pointerOriginX = imageViewerState.translateX;
    imageViewerState.pointerOriginY = imageViewerState.translateY;
    if (typeof stage.setPointerCapture === "function") {
      try {
        stage.setPointerCapture(event.pointerId);
      } catch (_error) {
        // Ignore pointer capture failures.
      }
    }
    applyImageViewerTransform();
    event.preventDefault();
  }

  function updateImageViewerDrag(event) {
    if (!imageViewerState.dragging || imageViewerState.pointerId !== event.pointerId) {
      return;
    }
    imageViewerState.translateX = imageViewerState.pointerOriginX + (event.clientX - imageViewerState.pointerStartX);
    imageViewerState.translateY = imageViewerState.pointerOriginY + (event.clientY - imageViewerState.pointerStartY);
    applyImageViewerTransform();
    event.preventDefault();
  }

  function endImageViewerDrag(event) {
    if (!imageViewerState.dragging) {
      return;
    }
    if (event && imageViewerState.pointerId !== null && event.pointerId !== imageViewerState.pointerId) {
      return;
    }
    stopImageViewerDrag();
    applyImageViewerTransform();
  }

  function handleImageViewerWheel(event) {
    if (imageViewerState.kind !== "image") {
      return;
    }
    event.preventDefault();
    setImageViewerScale(imageViewerState.scale + (event.deltaY < 0 ? 0.18 : -0.18));
  }

  function handleImageViewerDoubleClick(event) {
    if (imageViewerState.kind !== "image") {
      return;
    }
    event.preventDefault();
    if (Math.abs(imageViewerState.scale - imageViewerState.defaultScale) < 0.08) {
      setImageViewerScale(
        Math.min(
          imageViewerState.maxScale,
          normalizeImageViewerScale(Math.max(imageViewerState.defaultScale * 1.45, imageViewerState.defaultScale + 0.9))
        )
      );
      return;
    }
    resetImageViewerTransform();
  }

  function renderImageViewer() {
    var modal = imageViewerModal();
    var entry = imageViewerState.entries[imageViewerState.index];
    if (!modal || !entry) {
      return;
    }
    var image = modal.querySelector("[data-image-viewer-image]");
    var video = modal.querySelector("[data-image-viewer-video]");
    var title = modal.querySelector("[data-image-viewer-title]");
    var status = modal.querySelector("[data-image-viewer-status]");
    var caption = modal.querySelector("[data-image-viewer-caption]");
    var previous = modal.querySelector("[data-image-viewer-action='previous']");
    var next = modal.querySelector("[data-image-viewer-action='next']");
    var source = imageViewerEntrySource(entry);
    var entryTitle = imageViewerEntryTitle(entry);
    var entryKind = imageViewerEntryKind(entry);
    var hasMultiple = imageViewerState.entries.length > 1;

    imageViewerState.source = source;
    imageViewerState.kind = entryKind;
    if (title) {
      title.textContent = entryTitle;
    }
    if (status) {
      status.textContent = hasMultiple
        ? "第 " + (imageViewerState.index + 1) + " / " + imageViewerState.entries.length + " 项 · 正在准备媒体"
        : "正在准备媒体";
    }
    if (caption) {
      caption.textContent = entryTitle;
    }
    if (previous) {
      previous.hidden = !hasMultiple;
    }
    if (next) {
      next.hidden = !hasMultiple;
    }
    modal.querySelectorAll("[data-image-viewer-image-action]").forEach(function (control) {
      control.hidden = entryKind !== "image";
    });
    if (!image || !video) {
      return;
    }

    video.pause();
    video.removeAttribute("src");
    video.load();
    video.hidden = entryKind !== "video";
    image.hidden = entryKind !== "image";
    if (entryKind === "video") {
      video.src = source;
      video.load();
      applyImageViewerTransform();
      updateImageViewerStatus();
      return;
    }

    image.alt = entryTitle;
    image.dataset.state = "loading";
    image.onload = function () {
      if (imageViewerState.source === source) {
        image.dataset.state = "ready";
        syncImageViewerImageLayout(image, true);
      }
    };
    image.onerror = function () {
      if (imageViewerState.source === source) {
        image.dataset.state = "error";
        if (status) {
          status.textContent = "图片加载失败，可关闭后重新打开。";
        }
      }
    };
    image.src = refreshedImageSource(source);
    applyImageViewerTransform();
  }

  function openImageViewer(entries, index, trigger) {
    var modal = imageViewerModal();
    if (!modal || !entries.length) {
      return;
    }
    var sourceModal = trigger && trigger.closest("[data-modal]");
    imageViewerState.entries = entries;
    imageViewerState.index = Math.max(0, Math.min(index, entries.length - 1));
    resetImageViewerEntryState(imageViewerEntryKind(entries[imageViewerState.index]));
    renderImageViewer();
    if (sourceModal) {
      suspendModalForImageViewer(sourceModal);
      modal.imageViewerSourceModal = sourceModal;
    }
    openModal(modal, trigger, sourceModal);
  }

  function openAttachmentImagePreview(preview) {
    var retry = preview.dataset.imagePreviewState === "error";
    loadAttachmentImage(preview, retry)
      .then(function () {
        var entries = imageViewerEntriesFor(preview);
        openImageViewer(entries, Math.max(0, entries.indexOf(preview)), preview);
      })
      .catch(function () {});
  }

  function richAttachmentElement(target) {
    if (!target || typeof target.closest !== "function") {
      return null;
    }
    return target.closest(".discussion-rich-body [data-yuance-attachment-kind]");
  }

  function richAttachmentMetadata(attachment) {
    if (!attachment) {
      return null;
    }
    var kind = attachment.dataset.yuanceAttachmentKind || "";
    var media = attachment.matches("img, video")
      ? attachment
      : attachment.querySelector("img, video");
    var source = "";
    var title = "";
    if (kind === "file" && attachment.matches("a[href]")) {
      source = attachment.getAttribute("href") || "";
      title = attachment.getAttribute("title") || attachment.textContent || "附件";
    } else if (media) {
      source = media.currentSrc || media.getAttribute("src") || media.src || "";
      title =
        richAttachmentLabel(kind || (media.tagName === "VIDEO" ? "video" : "image"));
      if (!kind) {
        kind = media.tagName === "VIDEO" ? "video" : "image";
      }
    }
    if (!source) {
      return null;
    }
    return {
      kind: kind || "file",
      previewable: kind === "image" || kind === "video",
      source: source,
      title: String(title || "附件").replace(/\s+/g, " ").trim(),
    };
  }

  function absoluteAttachmentUrl(source) {
    try {
      return new URL(source, window.location.href).toString();
    } catch (_error) {
      return source || "";
    }
  }

  function copyTextToClipboard(text) {
    if (!text) {
      return Promise.reject(new Error("没有可复制的内容。"));
    }
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      var textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      textarea.style.top = "0";
      document.body.appendChild(textarea);
      textarea.select();
      try {
        if (document.execCommand("copy")) {
          resolve();
        } else {
          reject(new Error("浏览器拒绝复制。"));
        }
      } catch (error) {
        reject(error);
      } finally {
        textarea.remove();
      }
    });
  }

  function openRichAttachmentPreview(attachment) {
    var meta = richAttachmentMetadata(attachment);
    if (!meta || !meta.previewable) {
      showToast("该附件不支持预览。", "error");
      return;
    }
    attachment.dataset.imageSource = meta.source;
    attachment.dataset.imageTitle = meta.title;
    attachment.dataset.mediaKind = meta.kind === "video" ? "video" : "image";
    openImageViewer([attachment], 0, attachment);
  }

  function downloadRichAttachment(attachment) {
    var meta = richAttachmentMetadata(attachment);
    if (!meta) {
      showToast("附件下载地址不可用。", "error");
      return;
    }
    var link = document.createElement("a");
    link.href = meta.source;
    link.download = meta.title || "附件";
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  function ensureRichAttachmentMenu() {
    if (activeRichAttachmentMenu) {
      return activeRichAttachmentMenu;
    }
    var menu = document.createElement("div");
    menu.className = "rich-attachment-menu";
    menu.dataset.richAttachmentMenu = "";
    menu.setAttribute("role", "menu");
    menu.hidden = true;

    var title = document.createElement("div");
    title.className = "rich-attachment-menu-title";
    title.dataset.richAttachmentMenuTitle = "";

    var copy = document.createElement("button");
    copy.type = "button";
    copy.dataset.richAttachmentMenuAction = "copy";
    copy.setAttribute("role", "menuitem");
    copy.innerHTML = "<span>复制</span><em>复制附件链接</em>";

    var preview = document.createElement("button");
    preview.type = "button";
    preview.dataset.richAttachmentMenuAction = "preview";
    preview.setAttribute("role", "menuitem");
    preview.innerHTML = "<span>预览</span><em>查看图片 / 视频</em>";

    var download = document.createElement("button");
    download.type = "button";
    download.dataset.richAttachmentMenuAction = "download";
    download.setAttribute("role", "menuitem");
    download.innerHTML = "<span>下载</span><em>保存到本地</em>";

    menu.append(title, copy, preview, download);
    document.body.appendChild(menu);
    activeRichAttachmentMenu = menu;
    return menu;
  }

  function closeRichAttachmentMenu() {
    var menu = activeRichAttachmentMenu;
    if (!menu || menu.hidden) {
      return;
    }
    menu.classList.remove("open");
    menu.hidden = true;
    menu.richAttachment = null;
  }

  function positionRichAttachmentMenu(menu, x, y) {
    var margin = 10;
    menu.style.left = "0px";
    menu.style.top = "0px";
    var rect = menu.getBoundingClientRect();
    var left = Math.min(Math.max(margin, x), window.innerWidth - rect.width - margin);
    var top = Math.min(Math.max(margin, y), window.innerHeight - rect.height - margin);
    menu.style.left = Math.max(margin, left) + "px";
    menu.style.top = Math.max(margin, top) + "px";
  }

  function openRichAttachmentMenu(attachment, x, y) {
    var meta = richAttachmentMetadata(attachment);
    if (!meta) {
      return;
    }
    var menu = ensureRichAttachmentMenu();
    var title = menu.querySelector("[data-rich-attachment-menu-title]");
    var preview = menu.querySelector("[data-rich-attachment-menu-action='preview']");
    menu.richAttachment = attachment;
    if (title) {
      title.textContent = meta.title;
    }
    if (preview) {
      preview.hidden = !meta.previewable;
    }
    menu.hidden = false;
    menu.classList.add("open");
    positionRichAttachmentMenu(menu, x, y);
  }

  function openRichAttachmentMenuNear(attachment) {
    var rect = attachment.getBoundingClientRect();
    openRichAttachmentMenu(
      attachment,
      rect.left + Math.min(36, rect.width / 2),
      rect.top + Math.min(36, rect.height / 2)
    );
  }

  function handleRichAttachmentMenuAction(button) {
    var menu = button.closest("[data-rich-attachment-menu]");
    var attachment = menu && menu.richAttachment;
    var action = button.dataset.richAttachmentMenuAction || "";
    var meta = richAttachmentMetadata(attachment);
    if (!attachment || !meta) {
      closeRichAttachmentMenu();
      return;
    }
    if (action === "copy") {
      copyTextToClipboard(absoluteAttachmentUrl(meta.source))
        .then(function () {
          showToast("附件链接已复制。", "success");
        })
        .catch(function () {
          showToast("复制失败，请重试。", "error");
        });
    } else if (action === "preview") {
      openRichAttachmentPreview(attachment);
    } else if (action === "download") {
      downloadRichAttachment(attachment);
    }
    closeRichAttachmentMenu();
  }

  function stopImageViewerMedia(modal) {
    var video = modal && modal.querySelector("[data-image-viewer-video]");
    if (!video) {
      return;
    }
    video.pause();
    video.removeAttribute("src");
    video.load();
  }

  function changeImageViewerIndex(offset) {
    if (imageViewerState.entries.length <= 1) {
      return;
    }
    imageViewerState.index =
      (imageViewerState.index + offset + imageViewerState.entries.length) % imageViewerState.entries.length;
    resetImageViewerEntryState(imageViewerEntryKind(imageViewerState.entries[imageViewerState.index]));
    renderImageViewer();
  }

  function changeImageViewerZoom(amount) {
    setImageViewerScale(imageViewerState.scale + amount);
  }

  function resetImageViewerTransform() {
    imageViewerState.scale = imageViewerState.defaultScale || 1;
    imageViewerState.rotation = 0;
    imageViewerState.translateX = 0;
    imageViewerState.translateY = 0;
    stopImageViewerDrag();
    applyImageViewerTransform();
  }

  function handleImageViewerAction(action) {
    if (action === "previous") {
      changeImageViewerIndex(-1);
    } else if (action === "next") {
      changeImageViewerIndex(1);
    } else if (action === "zoom-in") {
      changeImageViewerZoom(0.25);
    } else if (action === "zoom-out") {
      changeImageViewerZoom(-0.25);
    } else if (action === "rotate") {
      imageViewerState.rotation = (imageViewerState.rotation + 90) % 360;
      stopImageViewerDrag();
      applyImageViewerTransform();
    } else if (action === "reset") {
      resetImageViewerTransform();
    }
  }

  function prefersReducedMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function isPlainWebNavigation(event, link) {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      (link.target && link.target !== "_self") ||
      link.hasAttribute("download") ||
      link.hasAttribute("hx-get") ||
      link.hasAttribute("data-hx-get") ||
      link.hasAttribute("data-modal-open") ||
      link.hasAttribute("data-modal-close") ||
      link.closest("[data-dropdown-trigger]")
    ) {
      return false;
    }

    var nextUrl;
    try {
      nextUrl = new URL(link.href, window.location.href);
    } catch (_error) {
      return false;
    }
    if (nextUrl.origin !== window.location.origin || !nextUrl.pathname.startsWith("/web")) {
      return false;
    }

    var current = window.location.pathname + window.location.search;
    var next = nextUrl.pathname + nextUrl.search;
    return current !== next;
  }

  function navigateWithTransition(event, link) {
    if (!document.body.matches("[data-page-transition]") || prefersReducedMotion()) {
      return;
    }
    if (!isPlainWebNavigation(event, link)) {
      return;
    }

    event.preventDefault();
    closeDropdowns();
    closeModals();
    if (link.closest("[data-content-tabs]")) {
      clearContentTabNavigation();
      contentTabNavigationControl = link.closest("[data-content-tabs]");
      setContentTabsPending(contentTabNavigationControl, true);
      contentTabNavigationTimer = window.setTimeout(function () {
        contentTabNavigationTimer = null;
        contentTabNavigationControl = null;
        window.location.href = link.href;
      }, CONTENT_TAB_SLIDE_MS);
      return;
    }
    clearContentTabNavigation();
    document.body.classList.add("page-leaving");
    window.setTimeout(function () {
      window.location.href = link.href;
    }, PAGE_TRANSITION_MS);
  }

  function closeDropdown(root) {
    if (!root) {
      return;
    }
    var trigger = root.querySelector("[data-dropdown-trigger]");
    var menu = root.querySelector("[data-dropdown-menu]");
    if (!trigger || !menu) {
      return;
    }
    if (root.dropdownCloseTimer) {
      window.clearTimeout(root.dropdownCloseTimer);
    }
    if (root.dropdownHoverCloseTimer) {
      window.clearTimeout(root.dropdownHoverCloseTimer);
      root.dropdownHoverCloseTimer = null;
    }
    root.dataset.dropdownOpen = "false";
    root.dataset.hoverOpen = "false";
    trigger.setAttribute("aria-expanded", "false");
    menu.classList.remove("open");
    root.dropdownCloseTimer = window.setTimeout(function () {
      if (root.dataset.dropdownOpen !== "true") {
        menu.hidden = true;
      }
    }, DROPDOWN_TRANSITION_MS);
  }

  function closeDropdowns(exceptRoot) {
    document.querySelectorAll("[data-dropdown-root]").forEach(function (root) {
      if (root !== exceptRoot) {
        closeDropdown(root);
      }
    });
  }

  function openDropdown(root, openedByHover) {
    if (!root) {
      return;
    }
    var trigger = root.querySelector("[data-dropdown-trigger]");
    var menu = root.querySelector("[data-dropdown-menu]");
    if (!trigger || !menu) {
      return;
    }
    if (root.dropdownCloseTimer) {
      window.clearTimeout(root.dropdownCloseTimer);
    }
    if (root.dropdownHoverCloseTimer) {
      window.clearTimeout(root.dropdownHoverCloseTimer);
      root.dropdownHoverCloseTimer = null;
    }
    closeDropdowns(root);
    root.dataset.dropdownOpen = "true";
    root.dataset.hoverOpen = openedByHover ? "true" : "false";
    trigger.setAttribute("aria-expanded", "true");
    menu.hidden = false;
    window.requestAnimationFrame(function () {
      menu.classList.add("open");
    });
  }

  function closeDrawers() {
    document.querySelectorAll(".drawer.open").forEach(function (drawer) {
      drawer.classList.remove("open");
      drawer.setAttribute("aria-hidden", "true");
    });
  }

  function modalFocusableElements(modal) {
    return Array.from(
      modal.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
    ).filter(function (item) {
      return !item.disabled && item.offsetParent !== null;
    });
  }

  function focusModal(modal) {
    var autofocus = modal.querySelector("[autofocus]");
    var focusable = modalFocusableElements(modal);
    var target = autofocus || focusable[0] || modal.querySelector(".modal-panel") || modal;
    window.setTimeout(function () {
      target.focus({ preventScroll: true });
    }, prefersReducedMotion() ? 0 : MODAL_TRANSITION_MS);
  }

  function openModal(modal, trigger, preservedModal) {
    if (!modal) {
      return;
    }
    closeDropdowns();
    closeDrawers();
    closeModals(modal, preservedModal);
    modal.lastModalTrigger = trigger || document.activeElement;
    if (modal.modalCloseTimer) {
      window.clearTimeout(modal.modalCloseTimer);
    }
    if (modal.modalOpenFrame) {
      window.cancelAnimationFrame(modal.modalOpenFrame);
    }
    if (modal.modalOpenTimer) {
      window.clearTimeout(modal.modalOpenTimer);
    }
    modal.hidden = false;
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
    var revealModal = function () {
      if (modal.classList.contains("open")) {
        return;
      }
      if (modal.modalOpenFrame) {
        window.cancelAnimationFrame(modal.modalOpenFrame);
      }
      if (modal.modalOpenTimer) {
        window.clearTimeout(modal.modalOpenTimer);
      }
      modal.modalOpenFrame = null;
      modal.modalOpenTimer = null;
      if (modal.getAttribute("aria-hidden") === "true" || modal.hidden) {
        return;
      }
      modal.classList.add("open");
      focusModal(modal);
    };
    modal.modalOpenFrame = window.requestAnimationFrame(revealModal);
    modal.modalOpenTimer = window.setTimeout(revealModal, 32);
  }

  function closeModal(modal, restoreFocus) {
    if (!modal || modal.hidden) {
      return;
    }
    if (modal.modalCloseTimer) {
      window.clearTimeout(modal.modalCloseTimer);
    }
    if (modal.modalOpenFrame) {
      window.cancelAnimationFrame(modal.modalOpenFrame);
      modal.modalOpenFrame = null;
    }
    if (modal.modalOpenTimer) {
      window.clearTimeout(modal.modalOpenTimer);
      modal.modalOpenTimer = null;
    }
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
    if (modal.matches("[data-image-viewer]")) {
      stopImageViewerDrag();
      stopImageViewerMedia(modal);
    }
    modal.modalCloseTimer = window.setTimeout(function () {
      if (!modal.classList.contains("open")) {
        modal.hidden = true;
      }
      if (modal.matches("[data-image-viewer]") && modal.imageViewerSourceModal) {
        restoreModalFromImageViewer(modal.imageViewerSourceModal);
        delete modal.imageViewerSourceModal;
      }
      if (!document.querySelector("[data-modal].open")) {
        document.body.classList.remove("modal-open");
      }
      if (restoreFocus && modal.lastModalTrigger && document.contains(modal.lastModalTrigger)) {
        modal.lastModalTrigger.focus({ preventScroll: true });
      }
    }, prefersReducedMotion() ? 0 : MODAL_TRANSITION_MS);
  }

  function closeModals(exceptModal, preservedModal) {
    document.querySelectorAll("[data-modal].open").forEach(function (modal) {
      if (modal !== exceptModal && modal !== preservedModal) {
        closeModal(modal, false);
      }
    });
  }

  function activeModal() {
    return document.querySelector("[data-image-viewer].open") || document.querySelector("[data-modal].open");
  }

  function openConfirmModal(form) {
    var modal = document.querySelector("[data-confirm-modal]");
    if (!modal) {
      form.submit();
      return;
    }
    pendingConfirmForm = form;
    var title = modal.querySelector("[data-confirm-title]");
    var message = modal.querySelector("[data-confirm-message]");
    var submit = modal.querySelector("[data-confirm-submit]");
    if (title) {
      title.textContent = form.dataset.confirmTitle || "确认操作";
    }
    if (message) {
      message.textContent = form.dataset.confirmMessage || "该操作提交后会立即生效。";
    }
    if (submit) {
      submit.textContent = form.dataset.confirmAction || "确认";
    }
    openModal(modal, form.querySelector("button[type='submit']") || form);
  }

  function submitConfirmedForm() {
    if (!pendingConfirmForm) {
      return;
    }
    var form = pendingConfirmForm;
    pendingConfirmForm = null;
    closeModal(document.querySelector("[data-confirm-modal]"), false);
    submitWebForm(form, form.querySelector("button[type='submit']"));
  }

  if (window.__YUANCE_ENABLE_TEST_HOOKS__) {
    window.__YUANCE_TEST_HOOKS__ = Object.assign(window.__YUANCE_TEST_HOOKS__ || {}, {
      apiErrorMessage: apiErrorMessage,
      mediaOrientation: mediaOrientation,
      preferredImageViewerScale: preferredImageViewerScale,
      filterSelectOptions: filterSelectOptions,
      reloadDiscussionAtComment: reloadDiscussionAtComment,
      richAttachmentMetadata: richAttachmentMetadata,
      absoluteAttachmentUrl: absoluteAttachmentUrl,
      richTextPlainText: richTextPlainText,
      richTextEditorHasUserContent: richTextEditorHasUserContent,
      selectPanelContentMinWidth: selectPanelContentMinWidth,
      selectPanelTargetWidth: selectPanelTargetWidth,
      publishBugReportRichText: publishBugReportRichText,
      replaceMessageCenterFromHtml: replaceMessageCenterFromHtml,
      submitBugReport: submitBugReport,
      submitDiscussion: submitDiscussion,
      submitMessageReadAll: submitMessageReadAll,
      loadMessageCenter: loadMessageCenter,
      submitWebForm: submitWebForm,
      syncRichTextForm: syncRichTextForm,
      webFormSuccessMessage: webFormSuccessMessage,
    });
  }

  applyTheme(readThemePreference());
  initUserAvatars();
  showQueuedToast();

  document.addEventListener("click", function (event) {
    var richMenuAction = event.target.closest("[data-rich-attachment-menu-action]");
    if (richMenuAction) {
      event.preventDefault();
      handleRichAttachmentMenuAction(richMenuAction);
      return;
    }
    if (!event.target.closest("[data-rich-attachment-menu]")) {
      closeRichAttachmentMenu();
    }

    var contentTab = event.target.closest("[data-content-tab]");
    if (contentTab) {
      activateContentTab(contentTab, true);
      if (contentTab.hasAttribute("data-tab-target")) {
        event.preventDefault();
        syncTabUrl(contentTab);
        return;
      }
    }

    var richFileAttachment = event.target.closest(".discussion-rich-body a[data-yuance-attachment-kind='file']");
    if (richFileAttachment) {
      event.preventDefault();
      openRichAttachmentMenuNear(richFileAttachment);
      return;
    }

    var messageCenterLink = event.target.closest("[data-message-center] a[href]");
    if (messageCenterLink && isMessageCenterUrl(messageCenterLink.href) && isPlainWebNavigation(event, messageCenterLink)) {
      event.preventDefault();
      loadMessageCenter(messageCenterLink.href, { history: true });
      return;
    }

    var link = event.target.closest("a[href]");
    if (link) {
      navigateWithTransition(event, link);
      if (event.defaultPrevented) {
        return;
      }
    }

    var localImagePreview = event.target.closest("[data-local-image-preview]");
    if (localImagePreview && !localImagePreview.disabled && localImagePreview.dataset.imageSource) {
      event.preventDefault();
      openImageViewer([localImagePreview], 0, localImagePreview);
      return;
    }

    var localMediaPreview = event.target.closest("[data-local-media-preview]");
    if (localMediaPreview && !localMediaPreview.disabled && localMediaPreview.dataset.imageSource) {
      event.preventDefault();
      openImageViewer([localMediaPreview], 0, localMediaPreview);
      return;
    }

    var attachmentMediaPreview = event.target.closest("[data-media-preview]");
    if (attachmentMediaPreview) {
      event.preventDefault();
      var mediaEntries = imageViewerEntriesFor(attachmentMediaPreview);
      openImageViewer(mediaEntries, Math.max(0, mediaEntries.indexOf(attachmentMediaPreview)), attachmentMediaPreview);
      return;
    }

    var attachmentImagePreview = event.target.closest("[data-image-preview]");
    if (attachmentImagePreview) {
      event.preventDefault();
      openAttachmentImagePreview(attachmentImagePreview);
      return;
    }

    var richMedia = event.target.closest(".discussion-rich-body img, .discussion-rich-body video");
    if (richMedia) {
      event.preventDefault();
      richMedia.dataset.imageSource = richMedia.currentSrc || richMedia.src || "";
      richMedia.dataset.imageTitle = richAttachmentLabel(richMedia.tagName === "VIDEO" ? "video" : "image");
      if (richMedia.tagName === "VIDEO") {
        richMedia.dataset.mediaKind = "video";
      }
      openImageViewer([richMedia], 0, richMedia);
      return;
    }

    var modalOpen = event.target.closest("[data-modal-open]");
    if (modalOpen) {
      event.preventDefault();
      var modal = document.getElementById(modalOpen.getAttribute("data-modal-open"));
      openModal(modal, modalOpen);
      return;
    }

    var modalClose = event.target.closest("[data-modal-close]");
    if (modalClose) {
      event.preventDefault();
      var modalToClose = modalClose.closest("[data-modal]") || activeModal();
      closeModal(modalToClose, true);
      return;
    }

    var imageViewerAction = event.target.closest("[data-image-viewer-action]");
    if (imageViewerAction) {
      event.preventDefault();
      handleImageViewerAction(imageViewerAction.dataset.imageViewerAction || "");
      return;
    }

    var bugReportAdd = event.target.closest("[data-bug-report-add]");
    if (bugReportAdd) {
      event.preventDefault();
      addBugReportGroup(bugReportAdd.closest("[data-bug-report-form]"));
      return;
    }

    var bugReportRemove = event.target.closest("[data-bug-report-remove]");
    if (bugReportRemove) {
      event.preventDefault();
      removeBugReportGroup(bugReportRemove);
      return;
    }

    var composerFileRemove = event.target.closest("[data-composer-file-remove]");
    if (composerFileRemove) {
      event.preventDefault();
      removeComposerFile(composerFileRemove);
      return;
    }

    var replyToggle = event.target.closest("[data-discussion-reply-toggle]");
    if (replyToggle) {
      event.preventDefault();
      var replyForm = document.getElementById(replyToggle.dataset.discussionReplyToggle || "");
      if (replyForm) {
        var shouldOpen = replyForm.hidden;
        document.querySelectorAll("[data-discussion-form].discussion-reply-form").forEach(function (form) {
          if (form !== replyForm && form.dataset.discussionBusy !== "true") {
            form.hidden = true;
          }
        });
        replyForm.hidden = !shouldOpen;
        if (shouldOpen) {
          replyForm.querySelector("[data-rich-text-input]")?.focus({ preventScroll: true });
          replyForm.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
      }
      return;
    }

    var richCommand = event.target.closest("[data-rich-command]");
    if (richCommand) {
      event.preventDefault();
      richTextCommand(richCommand.dataset.richCommand || "", richCommand.closest("[data-rich-text-editor]"));
      return;
    }

    var richRetry = event.target.closest("[data-rich-attachment-retry]");
    if (richRetry) {
      event.preventDefault();
      var retryNode = richRetry.closest("[data-rich-attachment]");
      var retryEditor = richRetry.closest("[data-rich-text-editor]");
      if (retryNode && retryEditor && retryNode.richFile) {
        uploadRichAttachment(retryEditor, retryNode, retryNode.richFile);
      }
      return;
    }

    var richRemove = event.target.closest("[data-rich-attachment-remove]");
    if (richRemove) {
      event.preventDefault();
      var removeNode = richRemove.closest("[data-rich-attachment]");
      if (removeNode) {
        removeRichAttachmentNode(removeNode);
      }
      return;
    }

    var replyCancel = event.target.closest("[data-discussion-reply-cancel]");
    if (replyCancel) {
      event.preventDefault();
      var cancelForm = replyCancel.closest("[data-discussion-form]");
      if (cancelForm && cancelForm.dataset.discussionBusy !== "true") {
        cancelForm.hidden = true;
      }
      return;
    }

    var trigger = event.target.closest("[data-dropdown-trigger]");
    if (trigger) {
      var root = trigger.closest("[data-dropdown-root]") || trigger.parentElement;
      var menu = root.querySelector("[data-dropdown-menu]");
      var expanded = trigger.getAttribute("aria-expanded") === "true";
      var wasOpenedByHover = root.dataset.hoverOpen === "true";
      if (!menu) {
        return;
      }
      if (expanded && !wasOpenedByHover) {
        closeDropdown(root);
      } else {
        openDropdown(root, false);
        focusProjectSearch(root);
      }
      return;
    }

    var projectOption = event.target.closest("[data-project-option]");
    if (projectOption) {
      event.preventDefault();
      submitProjectSwitch(projectOption);
      return;
    }

    var userOption = event.target.closest("[data-user-option]");
    if (userOption) {
      event.preventDefault();
      selectUserOption(userOption);
      return;
    }

    var themeToggle = event.target.closest("[data-theme-toggle]");
    if (themeToggle) {
      event.preventDefault();
      toggleTheme();
      return;
    }

    var confirmSubmit = event.target.closest("[data-confirm-submit]");
    if (confirmSubmit) {
      event.preventDefault();
      submitConfirmedForm();
      return;
    }

    if (!event.target.closest("[data-dropdown-menu]")) {
      closeDropdowns();
    }
    if (!event.target.closest("[data-user-combobox]")) {
      closeUserComboboxes();
    }
  });

  document.querySelectorAll("[data-dropdown-root]").forEach(function (root) {
    var trigger = root.querySelector("[data-dropdown-trigger]");
    var menu = root.querySelector("[data-dropdown-menu]");
    if (!trigger || !menu) {
      return;
    }
    if (root.matches("[data-project-switcher]")) {
      return;
    }

    root.addEventListener("mouseenter", function () {
      openDropdown(root, true);
      focusProjectSearch(root);
    });

    root.addEventListener("mouseleave", function () {
      if (root.dropdownHoverCloseTimer) {
        window.clearTimeout(root.dropdownHoverCloseTimer);
      }
      root.dropdownHoverCloseTimer = window.setTimeout(function () {
        root.dropdownHoverCloseTimer = null;
        if (!root.matches(":hover")) {
          closeDropdown(root);
        }
      }, 180);
    });
  });

  document.addEventListener("click", function (event) {
    var open = event.target.closest("[data-drawer-open]");
    if (open) {
      closeDropdowns();
      closeModals();
      var drawer = document.getElementById(open.getAttribute("data-drawer-open"));
      if (drawer) {
        drawer.classList.add("open");
        drawer.setAttribute("aria-hidden", "false");
      }
    }

    if (event.target.closest("[data-drawer-close]")) {
      var activeDrawer = event.target.closest(".drawer") || document.querySelector(".drawer.open");
      if (activeDrawer) {
        closeDrawers();
      }
    }
  });

  document.addEventListener("contextmenu", function (event) {
    var attachment = richAttachmentElement(event.target);
    if (!attachment) {
      closeRichAttachmentMenu();
      return;
    }
    event.preventDefault();
    closeDropdowns();
    openRichAttachmentMenu(attachment, event.clientX, event.clientY);
  });

  var viewerStage = imageViewerStage();
  if (viewerStage) {
    viewerStage.addEventListener("pointerdown", beginImageViewerDrag);
    viewerStage.addEventListener("pointermove", updateImageViewerDrag);
    viewerStage.addEventListener("pointerup", endImageViewerDrag);
    viewerStage.addEventListener("pointercancel", endImageViewerDrag);
    viewerStage.addEventListener("lostpointercapture", endImageViewerDrag);
    viewerStage.addEventListener("dblclick", handleImageViewerDoubleClick);
    viewerStage.addEventListener("dragstart", function (event) {
      event.preventDefault();
    });
    viewerStage.addEventListener("wheel", handleImageViewerWheel, { passive: false });
  }

  document.addEventListener("keydown", function (event) {
    var userComboboxInput = event.target.closest("[data-user-combobox-input]");
    if (userComboboxInput) {
      var userCombobox = userComboboxInput.closest("[data-user-combobox]");
      if (event.key === "Enter") {
        event.preventDefault();
        var firstUser = userCombobox
          ? Array.from(userCombobox.querySelectorAll("[data-user-option]")).find(function (option) {
              return !option.hidden;
            })
          : null;
        if (firstUser) {
          selectUserOption(firstUser);
        }
        return;
      }
      if (event.key === "Escape") {
        closeUserCombobox(userCombobox);
        return;
      }
    }

    var projectSearchInput = event.target.closest("[data-project-search-input]");
    if (event.key === "Enter" && projectSearchInput) {
      event.preventDefault();
      var switcher = projectSearchInput.closest("[data-project-switcher]");
      var firstVisible = switcher
        ? Array.from(switcher.querySelectorAll("[data-project-option]")).find(function (option) {
            return !option.hidden;
          })
        : null;
      if (firstVisible) {
        submitProjectSwitch(firstVisible);
      }
      return;
    }

    var currentTab = event.target.closest("[data-content-tab][role='tab']");
    if (currentTab && ["ArrowLeft", "ArrowRight", "Home", "End"].indexOf(event.key) >= 0) {
      var tabs = Array.from(currentTab.closest("[data-content-tabs]").querySelectorAll("[data-content-tab]"));
      var index = tabs.indexOf(currentTab);
      if (index >= 0) {
        event.preventDefault();
        var nextIndex = index;
        if (event.key === "ArrowRight") {
          nextIndex = (index + 1) % tabs.length;
        } else if (event.key === "ArrowLeft") {
          nextIndex = (index - 1 + tabs.length) % tabs.length;
        } else if (event.key === "Home") {
          nextIndex = 0;
        } else if (event.key === "End") {
          nextIndex = tabs.length - 1;
        }
        activateContentTab(tabs[nextIndex], true);
        syncTabUrl(tabs[nextIndex]);
        tabs[nextIndex].focus({ preventScroll: true });
      }
      return;
    }

    var currentModal = activeModal();
    if (currentModal && currentModal.matches("[data-image-viewer]")) {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        changeImageViewerIndex(-1);
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        changeImageViewerIndex(1);
        return;
      }
      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        changeImageViewerZoom(0.25);
        return;
      }
      if (event.key === "-") {
        event.preventDefault();
        changeImageViewerZoom(-0.25);
        return;
      }
      if (event.key.toLowerCase() === "r") {
        event.preventDefault();
        resetImageViewerTransform();
        return;
      }
    }
    if (event.key === "Tab" && currentModal) {
      var focusable = modalFocusableElements(currentModal);
      if (focusable.length === 0) {
        event.preventDefault();
        focusModal(currentModal);
        return;
      }
      var first = focusable[0];
      var last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
      return;
    }

    if (event.key === "Escape") {
      if (activeRichAttachmentMenu && !activeRichAttachmentMenu.hidden) {
        closeRichAttachmentMenu();
        return;
      }
      if (currentModal) {
        closeModal(currentModal, true);
        return;
      }
      closeDropdowns();
      closeDrawers();
    }
  });

  document.body.addEventListener("htmx:configRequest", function (event) {
    if (event.detail && event.detail.elt && typeof event.detail.elt.closest === "function") {
      normalizeUsernameInputs(event.detail.elt.closest("form"));
    }
    var token = csrfToken();
    if (token) {
      event.detail.headers["x-yuance-csrf-token"] = token;
    }
  });

  document.body.addEventListener("htmx:afterSwap", function (event) {
    applyTheme(readThemePreference());
    initUserAvatars(event.target);
    initTopbarSearch(event.target);
    initProjectSwitcher(event.target);
    initUserComboboxes(event.target);
    initMemberBatchForms(event.target);
    initTokenProjectScopes(event.target);
    initSelectControls(event.target);
    initContentTabs(event.target);
    initAttachmentImagePreviews(event.target);
    initDiscussionRichMedia(event.target);
    initRichTextEditors(event.target);
  });

  function syncPermissionParent(parent) {
    var scope = parent.closest("[data-permission-page]") || parent.closest("[data-permission-group]");
    if (!scope) {
      return;
    }

    var children = Array.from(scope.querySelectorAll("input[data-permission-node]")).filter(
      function (item) {
        return item !== parent && !item.disabled;
      }
    );
    if (children.length === 0) {
      parent.indeterminate = false;
      return;
    }

    var checkedCount = children.filter(function (item) {
      return item.checked;
    }).length;
    var isGroupParent = Boolean(parent.closest(".permission-group-head"));
    parent.indeterminate = checkedCount > 0 && checkedCount < children.length;
    if (isGroupParent) {
      parent.checked = checkedCount === children.length;
    } else if (checkedCount === children.length) {
      parent.checked = true;
    }
  }

  function syncPermissionTree(tree) {
    tree.querySelectorAll("[data-permission-page] input[data-permission-parent]").forEach(
      syncPermissionParent
    );
    tree.querySelectorAll("[data-permission-group] > .permission-group-head input[data-permission-parent]").forEach(
      syncPermissionParent
    );
  }

  document.querySelectorAll("[data-permission-tree]").forEach(syncPermissionTree);
  initRichTextEditors(document);

  document.addEventListener("change", function (event) {
    var discussionFiles = event.target.closest("[data-discussion-files]");
    if (discussionFiles) {
      syncDiscussionFiles(discussionFiles);
      return;
    }

    var bugReportImage = event.target.closest("[data-bug-report-image]");
    if (bugReportImage) {
      syncBugReportImageName(bugReportImage);
      return;
    }

    var fileInput = event.target.closest("[data-direct-upload] [data-attachment-file]");
    if (fileInput) {
      syncAttachmentFileFields(fileInput.closest("[data-direct-upload]"));
      return;
    }

    var checkbox = event.target.closest("[data-permission-tree] input[type='checkbox']");
    if (!checkbox || checkbox.disabled) {
      return;
    }

    var page = checkbox.closest("[data-permission-page]");
    var group = checkbox.closest("[data-permission-group]");

    if (checkbox.matches("[data-permission-parent]")) {
      var scope = page || group;
      if (scope) {
        scope.querySelectorAll("input[data-permission-node]").forEach(function (child) {
          if (!child.disabled) {
            child.checked = checkbox.checked;
          }
        });
      }
    } else if (checkbox.checked && page) {
      var pageParent = page.querySelector(":scope > .permission-check input[data-permission-parent]");
      if (pageParent && !pageParent.disabled) {
        pageParent.checked = true;
      }
    }

    var tree = checkbox.closest("[data-permission-tree]");
    if (tree) {
      syncPermissionTree(tree);
    }
  });

  document.addEventListener("submit", function (event) {
    normalizeUsernameInputs(event.target);
    if (
      !event.target.closest("[data-resource-form]") &&
      event.target.querySelector("[data-rich-text-editor]") &&
      !syncRichTextForm(event.target)
    ) {
      event.preventDefault();
      return;
    }
    event.target.querySelectorAll("[data-user-combobox]").forEach(function (combobox) {
      if (!validateUserCombobox(combobox)) {
        event.preventDefault();
        var input = combobox.querySelector("[data-user-combobox-input]");
        if (input) {
          input.reportValidity();
          input.focus({ preventScroll: true });
          openUserCombobox(combobox);
        }
      }
    });
    var memberBatchForm = event.target.closest("[data-member-batch-form]");
    if (memberBatchForm && !memberBatchForm.querySelector("[data-member-candidate-checkbox]:checked")) {
      event.preventDefault();
      updateMemberBatchForm(memberBatchForm);
      showToast("请至少选择一个要加入的项目成员。", "error");
      memberBatchForm.querySelector("[data-member-candidate-search]")?.focus({ preventScroll: true });
    }
    var tokenProjectScope = event.target.querySelector("[data-token-project-scope]");
    if (
      tokenProjectScope &&
      !tokenProjectScope.querySelector("[data-token-project-all]:checked") &&
      !tokenProjectScope.querySelector("[data-token-project-option]:checked")
    ) {
      event.preventDefault();
      updateTokenProjectScope(tokenProjectScope);
      showToast("请选择全部项目，或至少选择一个指定项目。", "error");
      tokenProjectScope.querySelector("summary")?.focus({ preventScroll: true });
    }
  }, true);

  document.addEventListener("submit", function (event) {
    if (event.defaultPrevented) {
      return;
    }

    var discussionForm = event.target.closest("[data-discussion-form]");
    if (discussionForm) {
      event.preventDefault();
      submitDiscussion(discussionForm, event.submitter);
      return;
    }

    var resourceForm = event.target.closest("[data-resource-form]");
    if (resourceForm) {
      event.preventDefault();
      submitProjectResource(resourceForm);
      return;
    }

    var bugReportForm = event.target.closest("[data-bug-report-form]");
    if (bugReportForm) {
      event.preventDefault();
      submitBugReport(bugReportForm);
      return;
    }

    var form = event.target.closest("[data-direct-upload]");
    if (form) {
      event.preventDefault();
      submitDirectUpload(form);
      return;
    }

    var confirmForm = event.target.closest("[data-confirm-submit-form]");
    if (confirmForm) {
      event.preventDefault();
      openConfirmModal(confirmForm);
      return;
    }

    var readAllForm = event.target.closest("[data-message-read-all-form], [data-notification-read-all]");
    if (readAllForm) {
      event.preventDefault();
      submitMessageReadAll(readAllForm, event.submitter || readAllForm.querySelector("button[type='submit']"));
      return;
    }

    var messageCenterForm = event.target.closest("[data-message-center-form]");
    if (messageCenterForm) {
      event.preventDefault();
      submitMessageCenterForm(messageCenterForm);
      return;
    }

    var webForm = event.target.closest("form[method='post']");
    if (
      webForm &&
      !webForm.matches("[hx-post], [data-hx-post]") &&
      !webForm.querySelector("input[type='file']") &&
      !webForm.action.endsWith("/web/login") &&
      !webForm.action.endsWith("/web/bootstrap/init")
    ) {
      event.preventDefault();
      submitWebForm(webForm, event.submitter || webForm.querySelector("button[type='submit']"));
    }
  });

  document.addEventListener("change", function (event) {
    var pageSize = event.target.closest("[data-pagination-size]");
    if (!pageSize) {
      return;
    }
    var form = pageSize.closest("[data-pagination-form]");
    var pageInput = form && form.querySelector("input[name='page']");
    if (pageInput) {
      pageInput.value = "1";
    }
    if (form) {
      form.requestSubmit();
    }
  });

  function handleProjectSearchEvent(event) {
    var input = event.target.closest("[data-project-search-input]");
    if (!input) {
      return;
    }
    var switcher = input.closest("[data-project-switcher]");
    if (switcher) {
      filterProjectOptions(switcher, input.value);
    }
  }

  ["input", "change", "search", "keyup"].forEach(function (eventName) {
    document.addEventListener(eventName, handleProjectSearchEvent);
  });

  function handleUserComboboxInput(event) {
    var input = event.target.closest("[data-user-combobox-input]");
    if (!input) {
      return;
    }
    var combobox = input.closest("[data-user-combobox]");
    if (!combobox) {
      return;
    }
    if (event.type !== "focusin") {
      clearUserComboboxSelection(combobox);
    }
    filterUserOptions(combobox, input.value);
    openUserCombobox(combobox);
  }

  ["focusin", "input", "search"].forEach(function (eventName) {
    document.addEventListener(eventName, handleUserComboboxInput);
  });

  document.addEventListener("input", function (event) {
    var input = event.target.closest("[data-member-candidate-search]");
    if (input) {
      filterMemberCandidates(input);
    }
  });

  document.addEventListener("change", function (event) {
    var checkbox = event.target.closest("[data-member-candidate-checkbox]");
    if (checkbox) {
      updateMemberBatchForm(memberBatchFormFor(checkbox));
    }

    var tokenProjectCheckbox = event.target.closest("[data-token-project-all], [data-token-project-option]");
    if (tokenProjectCheckbox) {
      var scope = tokenProjectCheckbox.closest("[data-token-project-scope]");
      var all = scope && scope.querySelector("[data-token-project-all]");
      if (tokenProjectCheckbox.matches("[data-token-project-option]") && tokenProjectCheckbox.checked && all) {
        all.checked = false;
      }
      updateTokenProjectScope(scope);
    }
  });

  ["input", "change"].forEach(function (eventName) {
    document.addEventListener(eventName, handleUsernameInput, true);
  });

  initTopbarSearch(document);
  initNotificationFeed(document.querySelector("[data-notification-root]"));
  initProjectSwitcher(document);
  initUserComboboxes(document);
  initMemberBatchForms(document);
  initTokenProjectScopes(document);
  initSelectControls(document);
  if (currentMessageCenter() && window.history && window.history.replaceState) {
    window.history.replaceState({ yuanceMessageCenter: true }, "", window.location.href);
  }
  window.addEventListener("popstate", function () {
    clearPageTransitionState();
    if (currentMessageCenter() && isMessageCenterUrl(window.location.href)) {
      loadMessageCenter(window.location.href, { history: false });
    }
  });
  document.querySelectorAll("[data-bug-report-form]").forEach(updateBugReportGroupTitles);
  initAttachmentImagePreviews(document);
  initDiscussionRichMedia(document);
  window.addEventListener("pagehide", function () {
    document.querySelectorAll("[data-file-preview]").forEach(function (preview) {
      if (preview.localObjectUrl) {
        URL.revokeObjectURL(preview.localObjectUrl);
      }
    });
  });
  initContentTabs(document);

  document.addEventListener("click", function (event) {
    if (
      activeSelectControl &&
      !event.target.closest(".select-control") &&
      !event.target.closest(".select-control-panel")
    ) {
      closeSelectControl(activeSelectControl, false);
    }
    document.querySelectorAll(".topbar-search").forEach(function (form) {
      if (!form.contains(event.target)) {
        closeSearchHistory(form);
      }
    });
  });

  window.addEventListener("resize", function () {
    closeRichAttachmentMenu();
    if (activeSelectControl) {
      positionSelectPanel(activeSelectControl);
    }
    refreshImageViewerLayout();
    scheduleContentTabsSync(false);
  });

  window.addEventListener("pageshow", function () {
    clearPageTransitionState();
    scheduleContentTabsSync(false);
  });

  window.addEventListener("scroll", function () {
    closeRichAttachmentMenu();
    if (activeSelectControl) {
      closeSelectControl(activeSelectControl, false);
    }
    loadVisibleAttachmentImages();
    scheduleVisibleAttachmentImageChecks();
  }, true);

  function initFileManager(container) {
    var manager = container && container.querySelector("[data-file-manager]");
    if (!manager) {
      return;
    }
    var projectKey = document.querySelector("[data-project-key]")?.dataset.projectKey || "";
    if (!projectKey) {
      return;
    }
    var treeList = manager.querySelector("[data-file-folder-tree-list]");
    var toggle = manager.querySelector("[data-file-folder-tree-toggle]");
    var content = manager.querySelector("[data-file-content]");
    var canManageFiles = Boolean(document.getElementById("project-file-move-modal"));
    var selectedFolderId = "";
    var contentRequestSeq = 0;

    if (toggle) {
      toggle.addEventListener("click", function () {
        var expanded = toggle.getAttribute("aria-expanded") === "true";
        toggle.setAttribute("aria-expanded", !expanded);
        toggle.textContent = expanded ? "▶" : "▼";
        toggle.setAttribute("aria-label", expanded ? "展开文件夹树" : "收起文件夹树");
        if (treeList) {
          treeList.hidden = expanded;
        }
      });
    }

    function renderFolderTree(items, depth) {
      if (!treeList || !items || items.length === 0) {
        return "";
      }
      var html = "";
      items.forEach(function (item) {
        var padding = depth * 16;
        var active = String(item.id) === selectedFolderId;
        var folderId = escapeHtml(item.id);
        html += '<button class="file-folder-item' + (active ? ' active' : '') + '" type="button" data-file-folder-item data-folder-id="' + folderId + '" style="padding-left:' + padding + 'px"' + (active ? ' aria-current="true"' : '') + '>';
        html += '<span class="file-folder-icon">📁</span>';
        html += '<span class="file-folder-name">' + escapeHtml(item.name) + '</span>';
        html += '</button>';
        if (item.children && item.children.length > 0) {
          html += renderFolderTree(item.children, depth + 1);
        }
      });
      return html;
    }

    function loadFolderTree() {
      if (!projectKey) {
        return;
      }
      fetchJson("/api/v1/projects/" + encodeURIComponent(projectKey) + "/folders/tree", {
        headers: { accept: "application/json" },
      })
        .then(function (items) {
          if (!treeList) {
            return;
          }
          var rootActive = selectedFolderId === "";
          var treeHtml = '<button class="file-folder-item' + (rootActive ? ' active' : '') + '" type="button" data-file-folder-item data-folder-id=""' + (rootActive ? ' aria-current="true"' : '') + '>';
          treeHtml += '<span class="file-folder-icon">📁</span>';
          treeHtml += '<span class="file-folder-name">全部文件</span>';
          treeHtml += '</button>';
          treeHtml += renderFolderTree(Array.isArray(items) ? items : [], 1);
          treeList.innerHTML = treeHtml;
        })
        .catch(function (error) {
          showToast(error.message || "文件夹加载失败。", "error");
        });
    }

    function attachmentStatusMeta(status) {
      if (status === "uploaded") {
        return { label: "已上传", tone: "ok" };
      }
      if (status === "deleted") {
        return { label: "已归档", tone: "danger" };
      }
      return { label: "待上传", tone: "warning" };
    }

    function renderFilePreview(item) {
      var title = escapeHtml(item.filename || "文件");
      var source = "/web/projects/" + pathSegment(projectKey) + "/attachments/" + pathSegment(item.id) + "/download";
      var sourceAttr = escapeHtml(source);
      var galleryId = escapeHtml("project-media-" + projectKey);
      if (item.status !== "uploaded") {
        return "";
      }
      if (isPreviewableImageType(item.content_type)) {
        return '<button class="attachment-image-preview" type="button" data-image-preview data-media-kind="image" data-image-source="' + sourceAttr + '" data-image-title="' + title + '" data-image-gallery="' + galleryId + '" aria-label="预览图片 ' + title + '"><span class="attachment-image-frame" data-image-preview-frame><img alt="' + title + '" data-image-preview-image hidden><span class="attachment-image-state" data-image-preview-status>加载图片预览</span></span><span class="attachment-image-caption">预览图片</span></button>';
      }
      if (isPreviewableVideoType(item.content_type)) {
        return '<button class="attachment-image-preview attachment-video-preview" type="button" data-media-preview data-media-kind="video" data-image-source="' + sourceAttr + '" data-image-title="' + title + '" data-image-gallery="' + galleryId + '" aria-label="预览视频 ' + title + '"><span class="attachment-image-frame"><video src="' + sourceAttr + '" muted preload="metadata" playsinline></video><span class="attachment-video-play" aria-hidden="true">▶</span></span><span class="attachment-image-caption">预览视频</span></button>';
      }
      return "";
    }

    function renderFolderContent(payload) {
      var folders = Array.isArray(payload && payload.folders) ? payload.folders : [];
      var files = Array.isArray(payload && payload.files) ? payload.files : [];
      if (folders.length === 0 && files.length === 0) {
        content.innerHTML = '<div class="empty-state"><strong>暂无文件</strong><span>该文件夹为空。</span></div>';
        return;
      }
      var html = '<div class="attachment-list">';
      folders.forEach(function (item) {
        var folderId = escapeHtml(item.id);
        html += '<article class="attachment-row folder-row">';
        html += '<div><strong>📁 ' + escapeHtml(item.name) + '</strong>';
        if (item.description) {
          html += '<span>' + escapeHtml(item.description) + '</span>';
        }
        html += '</div>';
        html += '<div class="attachment-actions">';
        html += '<button class="btn btn-sm btn-secondary" type="button" data-file-folder-open data-folder-id="' + folderId + '">打开</button>';
        html += '</div>';
        html += '</article>';
      });
      files.forEach(function (item) {
        var status = attachmentStatusMeta(item.status);
        var attachmentId = escapeHtml(item.id);
        var attachmentPath = pathSegment(item.id);
        var fileObjectId = escapeHtml(item.file_object_id);
        var projectPath = pathSegment(projectKey);
        html += '<article class="attachment-row">';
        html += '<div>';
        html += renderFilePreview(item);
        html += '<strong>' + escapeHtml(item.filename || "") + '</strong>';
        html += '<span>' + formatFileSize(item.byte_size) + ' · ' + escapeHtml(item.content_type || "application/octet-stream") + ' · 文件对象 #' + fileObjectId + '</span>';
        html += '<code>' + escapeHtml(item.object_key || "") + '</code>';
        html += '</div>';
        html += '<div class="attachment-actions">';
        html += '<span class="status status-' + status.tone + '">' + status.label + '</span>';
        if (item.status !== "deleted") {
          if (canManageFiles && item.status === "pending") {
            html += '<form class="inline-form attachment-resume-form" method="post" data-direct-upload data-existing-attachment-id="' + attachmentId + '" data-attachment-upload-url-template="/api/v1/projects/' + projectPath + '/attachments/{id}/upload-url" data-attachment-complete-url-template="/api/v1/projects/' + projectPath + '/attachments/{id}/uploaded" data-success-redirect="/web/projects/' + projectPath + '?tab=files">';
            html += '<input type="hidden" name="_csrf" value="' + escapeHtml(csrfToken()) + '">';
            html += '<label class="btn btn-sm btn-secondary attachment-file-button">选择文件<input class="sr-only" name="file" type="file" required data-attachment-file></label>';
            html += '<button class="btn btn-sm btn-primary" type="submit" data-upload-submit>继续上传</button>';
            html += '<span class="upload-status attachment-inline-status" role="status" aria-live="polite" data-upload-status>选择文件后继续上传。</span>';
            html += '</form>';
          }
          if (item.status === "uploaded") {
            html += '<a class="btn btn-sm btn-secondary" href="/web/projects/' + projectPath + '/attachments/' + attachmentPath + '/download" target="_blank" rel="noopener">下载文件</a>';
          } else {
            html += '<span class="attachment-action-hint">上传完成后可下载</span>';
          }
          if (canManageFiles) {
            html += '<button class="btn btn-sm btn-secondary" type="button" data-file-move data-attachment-id="' + attachmentId + '" data-file-object-id="' + fileObjectId + '">移动到</button>';
            html += '<form class="inline-form" method="post" action="/web/projects/' + projectPath + '/attachments/' + attachmentPath + '/delete" data-confirm-submit-form data-confirm-title="归档项目文件" data-confirm-message="确认归档文件 ' + escapeHtml(item.filename || "文件") + '？归档后不能继续下载，文件记录仍会保留。" data-confirm-action="归档">';
            html += '<input type="hidden" name="_csrf" value="' + escapeHtml(csrfToken()) + '">';
            html += '<button class="btn btn-sm btn-danger" type="submit">归档</button>';
            html += '</form>';
          }
        }
        html += '</div>';
        html += '</article>';
      });
      html += '</div>';
      content.innerHTML = html;
      initAttachmentImagePreviews(content);
      loadVisibleAttachmentImages();
      scheduleVisibleAttachmentImageChecks();
    }

    function loadFolderContent(folderId) {
      if (!projectKey || !content) {
        return;
      }
      var requestedFolderId = folderId || "";
      selectedFolderId = requestedFolderId;
      var requestId = ++contentRequestSeq;
      var url = "/api/v1/projects/" + encodeURIComponent(projectKey) + "/folders/content";
      if (requestedFolderId) {
        url += "?folder_id=" + encodeURIComponent(requestedFolderId);
      }
      content.setAttribute("aria-busy", "true");
      fetchJson(url, { headers: { accept: "application/json" } })
        .then(function (payload) {
          if (requestId !== contentRequestSeq || requestedFolderId !== selectedFolderId) {
            return;
          }
          renderFolderContent(payload || {});
        })
        .catch(function (error) {
          if (requestId !== contentRequestSeq || requestedFolderId !== selectedFolderId) {
            return;
          }
          content.innerHTML = '<div class="empty-state"><strong>文件加载失败</strong><span>' + escapeHtml(error.message || "请稍后重试。") + '</span></div>';
        })
        .finally(function () {
          if (requestId === contentRequestSeq) {
            content.removeAttribute("aria-busy");
          }
        });
    }

    treeList && treeList.addEventListener("click", function (event) {
      var item = event.target.closest("[data-file-folder-item]");
      if (!item) {
        return;
      }
      treeList.querySelectorAll("[data-file-folder-item]").forEach(function (el) {
        el.classList.remove("active");
        el.removeAttribute("aria-current");
      });
      item.classList.add("active");
      item.setAttribute("aria-current", "true");
      var folderId = item.dataset.folderId || "";
      loadFolderContent(folderId);
    });

    content && content.addEventListener("click", function (event) {
      var openBtn = event.target.closest("[data-file-folder-open]");
      if (openBtn) {
        var folderId = openBtn.dataset.folderId || "";
        treeList.querySelectorAll("[data-file-folder-item]").forEach(function (el) {
          el.classList.remove("active");
          el.removeAttribute("aria-current");
        });
        var targetItem = treeList.querySelector('[data-folder-id="' + folderId + '"]');
        if (targetItem) {
          targetItem.classList.add("active");
          targetItem.setAttribute("aria-current", "true");
        }
        loadFolderContent(folderId);
      }
    });

    loadFolderTree();
    loadFolderContent(null);
  }

  function initFolderSelects(projectKey) {
    var selects = document.querySelectorAll("[data-select-searchable][name='parent_id'], [data-select-searchable][name='folder_id']");
    selects.forEach(function (select) {
      if (select.dataset.folderOptionsLoaded === "true" || select.dataset.folderOptionsLoading === "true") {
        return;
      }
      select.dataset.folderOptionsLoading = "true";
      var url = "/api/v1/projects/" + encodeURIComponent(projectKey) + "/folders/tree";
      fetchJson(url, { headers: { accept: "application/json" } })
        .then(function (items) {
          function addOptions(folderItems, prefix) {
            (folderItems || []).forEach(function (item) {
              if (select.querySelector('option[value="' + CSS.escape(String(item.id)) + '"]')) {
                return;
              }
              var option = document.createElement("option");
              option.value = item.id;
              option.textContent = (prefix || "") + item.name;
              select.appendChild(option);
              if (item.children && item.children.length > 0) {
                addOptions(item.children, (prefix || "") + "  ");
              }
            });
          }
          addOptions(Array.isArray(items) ? items : [], "");
          select.dataset.folderOptionsLoaded = "true";
          rebuildSelectControl(select);
        })
        .catch(function (error) {
          delete select.dataset.folderOptionsLoaded;
          showToast(error.message || "文件夹选项加载失败。", "error");
        })
        .finally(function () {
          delete select.dataset.folderOptionsLoading;
        });
    });
  }

  document.addEventListener("click", function (event) {
    var fileMoveBtn = event.target.closest("[data-file-move]");
    if (fileMoveBtn) {
      event.preventDefault();
      var modal = document.getElementById("project-file-move-modal");
      if (!modal) {
        return;
      }
      var fileObjectId = fileMoveBtn.dataset.fileObjectId;
      var input = modal.querySelector("[data-file-move-file-object-id]");
      if (input) {
        input.value = fileObjectId;
      }
      var actionInput = modal.querySelector("form");
      if (actionInput && fileObjectId) {
        actionInput.dataset.action = "/api/v1/file-objects/" + fileObjectId + "/folder";
      }
      openModal(modal, fileMoveBtn);
    }
  });

  var projectKey = document.querySelector("[data-project-key]")?.dataset.projectKey || "";
  if (projectKey) {
    initFileManager(document);
    initFolderSelects(projectKey);
  }
})();
