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
  var activeSelectControl = null;
  var imagePreviewObserver = null;
  var imagePreviewFallbackTimer = null;
  var imageViewerState = {
    entries: [],
    index: 0,
    scale: 1,
    rotation: 0,
    source: "",
  };
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
    } catch (_error) {
      // The next page can still load when sessionStorage is unavailable.
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

  function notificationKindLabel(kind) {
    return kind === "comment_replied" ? "回复" : "指派";
  }

  function renderNotificationFeed(root, feed) {
    var badge = root.querySelector("[data-notification-badge]");
    var summary = root.querySelector("[data-notification-summary]");
    var list = root.querySelector("[data-notification-list]");
    var unreadCount = Number(feed && feed.unread_count || 0);
    if (badge) {
      badge.hidden = unreadCount === 0;
      badge.textContent = unreadCount > 99 ? "99+" : String(unreadCount);
    }
    if (summary) {
      summary.textContent = unreadCount ? unreadCount + " 条未读" : "暂无未读";
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
      link.href = item.open_url;

      var dot = document.createElement("span");
      dot.className = "notification-dot";
      dot.setAttribute("aria-hidden", "true");
      var content = document.createElement("span");
      content.className = "notification-item-content";
      var title = document.createElement("strong");
      title.textContent = item.title;
      var detail = document.createElement("span");
      detail.textContent = item.body;
      var meta = document.createElement("small");
      meta.textContent = notificationKindLabel(item.kind) + " · " + item.actor + " · " + item.created_at;
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

  async function submitWebForm(form, submitter) {
    if (!form || form.dataset.webFormBusy === "true") {
      return;
    }
    if (!form.reportValidity()) {
      return;
    }
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
        showToast(form.dataset.successMessage || "操作已完成。", "success");
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
      if (response.status === 401 || payload?.error?.code === "unauthorized") {
        redirectToLogin();
        return;
      }
      if (!response.ok) {
        throw new Error(payload?.error?.message || "操作失败，请稍后重试。");
      }
      if (response.redirected && response.url) {
        window.location.assign(response.url);
        return;
      }
      if (html) {
        var result = new DOMParser().parseFromString(html, "text/html").querySelector(".inline-result");
        queueToast(
          result?.textContent?.trim() || "操作已完成。",
          result?.classList.contains("storage-message-error") ? "error" : "success"
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
    control.selectPanel.querySelectorAll("[data-select-option]").forEach(function (button) {
      var selected = button.dataset.value === select.value;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-selected", selected ? "true" : "false");
    });
  }

  function positionSelectPanel(control) {
    var panel = control && control.selectPanel;
    var trigger = control && control.querySelector("[data-select-control-trigger]");
    if (!panel || !trigger || panel.hidden) {
      return;
    }
    var rect = trigger.getBoundingClientRect();
    var gutter = 8;
    var searchable = control.selectElement.dataset.selectSearchable !== undefined;
    var width = Math.min(searchable ? Math.max(rect.width, 320) : rect.width, window.innerWidth - 24);
    var left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12));
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
      if (matches) {
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
      panel.classList.remove("open");
      window.setTimeout(function () {
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
    panel.hidden = false;
    activeSelectControl = control;
    control.classList.add("open");
    trigger.setAttribute("aria-expanded", "true");
    filterSelectOptions(control, "");
    positionSelectPanel(control);
    window.requestAnimationFrame(function () {
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
    select.querySelectorAll("option").forEach(function (option) {
      var button = document.createElement("button");
      button.className = "select-control-option";
      button.type = "button";
      button.dataset.selectOption = "";
      button.dataset.value = option.value;
      button.textContent = option.textContent.trim();
      button.disabled = option.disabled;
      button.setAttribute("role", "option");
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
      options.appendChild(button);
    });
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
    new MutationObserver(function () { syncSelectControl(control); }).observe(select, { attributes: true, attributeFilter: ["disabled"] });
    syncSelectControl(control);
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
      if (control.selectPanel) {
        control.selectPanel.remove();
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
    if (tabKey === "work") {
      nextUrl.searchParams.delete("tab");
    } else {
      nextUrl.searchParams.set("tab", tabKey);
    }
    window.history.replaceState(null, "", nextUrl.pathname + nextUrl.search + nextUrl.hash);
  }

  function initContentTabs(root) {
    (root || document).querySelectorAll("[data-content-tabs]").forEach(function (control) {
      var active = control.querySelector("[data-content-tab].active") || control.querySelector("[data-content-tab]");
      if (active) {
        activateContentTab(active, false);
      }
    });
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

  function directUploadStatus(form, message, tone) {
    var status = form.querySelector("[data-upload-status]");
    if (!status) {
      return;
    }
    status.textContent = message;
    status.dataset.tone = tone || "info";
  }

  function bugReportStatus(form, message, tone) {
    var status = form.querySelector("[data-bug-report-status]");
    if (!status) {
      return;
    }
    status.textContent = message;
    status.dataset.tone = tone || "info";
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
  }

  function syncAttachmentFileFields(form) {
    var fileInput = form.querySelector("[data-attachment-file]");
    var file = fileInput && fileInput.files ? fileInput.files[0] : null;
    var filename = form.querySelector("[data-attachment-filename]");
    var contentType = form.querySelector("[data-attachment-content-type]");
    var byteSize = form.querySelector("[data-attachment-byte-size]");
    var previewAnchor = fileInput && fileInput.closest(".upload-picker");
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
    if (filename) {
      filename.value = file.name || "attachment.bin";
    }
    if (contentType) {
      contentType.value = file.type || "application/octet-stream";
    }
    if (byteSize) {
      byteSize.value = String(file.size || 0);
    }
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

  function uploadSignedFile(request, file, contentType, onProgress) {
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
      var message =
        payload && payload.error && payload.error.message
          ? payload.error.message
          : "请求失败：" + response.status;
      throw new Error(message);
    }
    return payload.data;
  }

  async function uploadAttachmentFile(options) {
    var file = options.file;
    var filename = options.filename || file.name || "attachment.bin";
    var contentType = options.contentType || file.type || "application/octet-stream";
    var byteSize = Number(options.byteSize || file.size || 0);
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

    if (typeof options.onStage === "function") {
      options.onStage("signing");
    }
    var signed = await fetchJson(options.uploadUrl(attachment.id), {
      method: "GET",
      headers: { accept: "application/json" },
    });

    var request = signed.request || {};
    if (typeof options.onStage === "function") {
      options.onStage("uploading");
    }
    await uploadSignedFile(request, file, contentType, options.onProgress);

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
    var file = fileInput && fileInput.files ? fileInput.files[0] : null;
    if (!file) {
      directUploadStatus(form, "请先选择要上传的文件。", "error");
      return;
    }

    setDirectUploadBusy(form, true);
    var existingAttachmentId = form.dataset.existingAttachmentId || "";
    var selectedFileDescription = formatFileSize(file.size);
    directUploadStatus(form, existingAttachmentId ? "正在获取上传签名..." : "正在登记附件元数据...", "info");
    setUploadTransfer(
      form,
      0,
      existingAttachmentId ? "准备继续上传" : "正在登记附件",
      existingAttachmentId ? "正在复用已登记附件。" : "正在保存文件元数据。",
      "info"
    );
    try {
      await uploadAttachmentFile({
        file: file,
        filename: form.querySelector("[data-attachment-filename]")?.value || file.name,
        contentType:
          form.querySelector("[data-attachment-content-type]")?.value ||
          file.type ||
          "application/octet-stream",
        byteSize: Number(form.querySelector("[data-attachment-byte-size]")?.value || file.size || 0),
        folderId: form.querySelector("select[name='folder_id']")?.value || "",
        existingAttachmentId: existingAttachmentId,
        createUrl: form.dataset.attachmentCreateUrl,
        uploadUrl: function (attachmentId) {
          return attachmentUrlFromTemplate(form.dataset.attachmentUploadUrlTemplate, attachmentId);
        },
        completeUrl: function (attachmentId) {
          return attachmentUrlFromTemplate(form.dataset.attachmentCompleteUrlTemplate, attachmentId);
        },
        onAttachmentReady: function (attachment) {
          form.dataset.existingAttachmentId = String(attachment.id);
          form.pendingAttachmentFile = file;
        },
        onStage: function (stage) {
          if (stage === "signing") {
            directUploadStatus(form, "正在获取上传签名...", "info");
            setUploadTransfer(form, 0, "正在获取上传签名", "已登记 " + selectedFileDescription + "。", "info");
          } else if (stage === "uploading") {
            directUploadStatus(form, "正在直传文件到对象存储...", "info");
            setUploadTransfer(form, 0, "正在上传", "正在传输 " + selectedFileDescription + "。", "info");
          } else if (stage === "finalizing") {
            directUploadStatus(form, "文件已传输，正在确认上传结果...", "info");
            setUploadTransfer(form, 100, "正在确认上传结果", "正在更新附件状态。", "info");
          }
        },
        onProgress: function (percent) {
          if (typeof percent === "number") {
            setUploadTransfer(form, percent, "正在上传", "已传输 " + Math.round(percent) + "% 。", "info");
          } else {
            setUploadTransfer(form, null, "正在上传", "浏览器未提供可计算的传输长度。", "info");
          }
        },
      });
      setUploadTransfer(form, 100, "上传完成", "附件已安全写入对象存储。", "success");
      if (!existingAttachmentId) {
        directUploadStatus(form, "附件上传完成，正在刷新页面。", "success");
      } else {
        directUploadStatus(form, "附件继续上传完成，正在刷新页面。", "success");
      }
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
        group.dataset.discussionLocked === "true";
      row.append(media, details, remove);
      list.appendChild(row);
    });
  }

  function removeComposerFile(button) {
    var group = button.closest("[data-bug-report-group], [data-discussion-form]");
    if (
      !group ||
      group.dataset.bugReportLocked === "true" ||
      group.dataset.discussionLocked === "true"
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
    if (!status) {
      return;
    }
    status.hidden = !message;
    status.textContent = message || "";
    status.dataset.tone = tone || "info";
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

  function setDiscussionBusy(form, busy) {
    form.dataset.discussionBusy = busy ? "true" : "false";
    form.querySelectorAll("button, textarea, input, select").forEach(function (control) {
      control.disabled = busy;
    });
    var submit = form.querySelector("[data-discussion-submit]");
    if (submit) {
      submit.textContent = busy ? "正在提交..." : submit.dataset.originalLabel || "发表";
    }
  }

  async function submitDiscussion(form, submitter) {
    if (form.dataset.discussionBusy === "true" || !form.reportValidity()) {
      return;
    }
    var itemKey = form.dataset.itemKey || "";
    var bodyInput = form.querySelector("[data-discussion-body]");
    var parentInput = form.querySelector("input[name='parent_comment_id']");
    var files = form.bugReportFiles || [];
    var submit = form.querySelector("[data-discussion-submit]");
    if (submit && !submit.dataset.originalLabel) {
      submit.dataset.originalLabel = submit.textContent.trim();
    }
    setDiscussionBusy(form, true);
    try {
      var commentId = form.dataset.discussionCommentId || "";
      if (!commentId) {
        discussionStatus(form, "正在发表内容...", "info");
        var comment = await fetchJson(
          "/api/v1/work-items/" + encodeURIComponent(itemKey) + "/comments",
          {
            method: "POST",
            headers: { "content-type": "application/json", accept: "application/json" },
            body: JSON.stringify({
              body: bodyInput ? bodyInput.value.trim() : "",
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
        submitter &&
        submitter.matches("[data-discussion-assign]") &&
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
      discussionStatus(form, "发表成功，正在刷新讨论...", "success");
      window.setTimeout(function () {
        window.location.reload();
      }, 350);
    } catch (error) {
      discussionStatus(form, (error && error.message) || "提交失败，请重试。", "error");
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

  function isBugReportControlLocked(form, control) {
    if (form.dataset.bugReportItemKey && control.matches("[data-bug-report-item-field]")) {
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

  async function submitBugReport(form) {
    if (form.dataset.bugReportBusy === "true") {
      return;
    }
    if (!form.reportValidity()) {
      return;
    }
    var groups = collectBugReportGroups(form);
    var itemLabel = form.dataset.workItemLabel || "工作项";
    var formData = new FormData(form);
    setBugReportBusy(form, true);
    try {
      var item = { key: form.dataset.bugReportItemKey || "" };
      if (!item.key) {
        bugReportStatus(form, "正在创建" + itemLabel + "...", "info");
        item = await fetchJson(form.dataset.bugReportCreateUrl || "/api/v1/work-items", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            accept: "application/json",
          },
          body: JSON.stringify({
            project_key: formData.get("project_key") || "",
            item_type: formData.get("item_type") || "bug",
            title: formData.get("title") || "",
            description: formData.get("description") || "",
            priority: formData.get("priority") || "P2",
            assignee_username: formData.get("assignee_username") || "",
            due_date: formData.get("due_date") || "",
            parent_item_key: formData.get("parent_item_key") || "",
          }),
        });
        form.dataset.bugReportItemKey = item.key;
        applyBugReportPersistedLocks(form);
      } else {
        bugReportStatus(form, "继续完成已创建" + itemLabel + "的附件上传...", "info");
      }

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

      bugReportStatus(form, itemLabel + "创建完成，正在打开详情页。", "success");
      window.setTimeout(function () {
        window.location.href = "/web/work-items/" + encodeURIComponent(item.key);
      }, 450);
    } catch (error) {
      bugReportStatus(form, error.message || itemLabel + "创建失败，请稍后重试。", "error");
      setBugReportBusy(form, false);
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

  function applyImageViewerTransform() {
    var modal = imageViewerModal();
    var image = modal && modal.querySelector("[data-image-viewer-image]");
    if (!image) {
      return;
    }
    image.style.transform = "scale(" + imageViewerState.scale + ") rotate(" + imageViewerState.rotation + "deg)";
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
    if (title) {
      title.textContent = entryTitle;
    }
    if (status) {
      status.textContent = hasMultiple
        ? "第 " + (imageViewerState.index + 1) + " / " + imageViewerState.entries.length + " 项"
        : "适屏查看";
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
      if (status) {
        status.textContent = hasMultiple
          ? "第 " + (imageViewerState.index + 1) + " / " + imageViewerState.entries.length + " 项 · 视频"
          : "视频预览";
      }
      return;
    }

    image.alt = entryTitle;
    image.dataset.state = "loading";
    image.onload = function () {
      if (imageViewerState.source === source) {
        image.dataset.state = "ready";
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
    imageViewerState.scale = 1;
    imageViewerState.rotation = 0;
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
    imageViewerState.scale = 1;
    imageViewerState.rotation = 0;
    renderImageViewer();
  }

  function changeImageViewerZoom(amount) {
    imageViewerState.scale = Math.max(0.5, Math.min(4, Math.round((imageViewerState.scale + amount) * 100) / 100));
    applyImageViewerTransform();
  }

  function resetImageViewerTransform() {
    imageViewerState.scale = 1;
    imageViewerState.rotation = 0;
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
      if (contentTabNavigationTimer) {
        window.clearTimeout(contentTabNavigationTimer);
      }
      contentTabNavigationTimer = window.setTimeout(function () {
        contentTabNavigationTimer = null;
        window.location.href = link.href;
      }, CONTENT_TAB_SLIDE_MS);
      return;
    }
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

  applyTheme(readThemePreference());
  initUserAvatars();
  showQueuedToast();

  document.addEventListener("click", function (event) {
    var contentTab = event.target.closest("[data-content-tab]");
    if (contentTab) {
      activateContentTab(contentTab, true);
      if (contentTab.hasAttribute("data-tab-target")) {
        event.preventDefault();
        syncTabUrl(contentTab);
        return;
      }
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
          replyForm.querySelector("[data-discussion-body]")?.focus({ preventScroll: true });
          replyForm.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
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
      closeDropdown(root);
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
    initSelectControls(event.target);
    initContentTabs(event.target);
    initAttachmentImagePreviews(event.target);
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

  ["input", "change"].forEach(function (eventName) {
    document.addEventListener(eventName, handleUsernameInput, true);
  });

  initTopbarSearch(document);
  initNotificationFeed(document.querySelector("[data-notification-root]"));
  initProjectSwitcher(document);
  initUserComboboxes(document);
  initSelectControls(document);
  document.querySelectorAll("[data-bug-report-form]").forEach(updateBugReportGroupTitles);
  initAttachmentImagePreviews(document);
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
    if (activeSelectControl) {
      positionSelectPanel(activeSelectControl);
    }
    document.querySelectorAll("[data-content-tabs]").forEach(function (control) {
      syncContentTabs(control, false);
    });
  });

  window.addEventListener("scroll", function () {
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
        return { label: "已删除", tone: "danger" };
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
          html += '<form class="inline-form" method="post" action="/web/projects/' + projectPath + '/attachments/' + attachmentPath + '/delete" data-confirm-submit-form data-confirm-title="删除项目文件" data-confirm-message="确认删除文件 ' + escapeHtml(item.filename || "文件") + '？删除后不能继续下载。" data-confirm-action="删除">';
          html += '<input type="hidden" name="_csrf" value="' + escapeHtml(csrfToken()) + '">';
          html += '<button class="btn btn-sm btn-danger" type="submit">删除</button>';
          html += '</form>';
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
