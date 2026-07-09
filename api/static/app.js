(function () {
  var DROPDOWN_TRANSITION_MS = 240;
  var PAGE_TRANSITION_MS = 150;
  var MODAL_TRANSITION_MS = 180;
  var THEME_STORAGE_KEY = "yuance-theme";
  var pendingConfirmForm = null;
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

  function initTopbarSearch(root) {
    var input = (root || document).querySelector("[data-topbar-search-input]");
    if (!input || window.location.pathname !== "/web/search") {
      return;
    }
    input.value = new URLSearchParams(window.location.search).get("q") || "";
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

  function activateTab(trigger) {
    var root = trigger.closest("[data-tabs]");
    if (!root) {
      return;
    }
    var targetId = trigger.getAttribute("data-tab-target");
    if (!targetId) {
      return;
    }
    root.querySelectorAll("[data-tab-trigger]").forEach(function (item) {
      var active = item === trigger;
      item.classList.toggle("active", active);
      item.setAttribute("aria-selected", active ? "true" : "false");
      item.tabIndex = active ? 0 : -1;
    });
    root.querySelectorAll("[data-tab-panel]").forEach(function (panel) {
      var active = panel.id === targetId;
      panel.classList.toggle("active", active);
      panel.hidden = !active;
    });
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

  function initTabs(root) {
    (root || document).querySelectorAll("[data-tabs]").forEach(function (tabs) {
      var active = tabs.querySelector("[data-tab-trigger].active") || tabs.querySelector("[data-tab-trigger]");
      if (active) {
        activateTab(active);
      }
    });
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
      control.disabled = busy;
    });
  }

  function syncAttachmentFileFields(form) {
    var fileInput = form.querySelector("[data-attachment-file]");
    var file = fileInput && fileInput.files ? fileInput.files[0] : null;
    var filename = form.querySelector("[data-attachment-filename]");
    var contentType = form.querySelector("[data-attachment-content-type]");
    var byteSize = form.querySelector("[data-attachment-byte-size]");
    if (!file) {
      directUploadStatus(form, "等待选择文件。", "info");
      return;
    }
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
    directUploadStatus(
      form,
      "已选择 " +
        (file.name || "附件") +
        (isResume ? "，点击继续上传会覆盖该附件对象。" : "，点击上传后会直传对象存储。"),
      "ready"
    );
  }

  function directUploadHeaders(headerPairs, fallbackContentType) {
    var headers = new Headers();
    (headerPairs || []).forEach(function (pair) {
      var key = pair && pair[0] ? String(pair[0]) : "";
      var value = pair && pair[1] ? String(pair[1]) : "";
      if (!key || ["host", "content-length"].indexOf(key.toLowerCase()) >= 0) {
        return;
      }
      headers.set(key, value);
    });
    if (fallbackContentType && !headers.has("content-type")) {
      headers.set("content-type", fallbackContentType);
    }
    return headers;
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
    var attachment = options.existingAttachmentId
      ? { id: options.existingAttachmentId }
      : await fetchJson(options.createUrl, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            accept: "application/json",
          },
          body: JSON.stringify({
            original_filename: filename,
            content_type: contentType,
            byte_size: byteSize,
          }),
        });

    var signed = await fetchJson(options.uploadUrl(attachment.id), {
      method: "GET",
      headers: { accept: "application/json" },
    });

    var request = signed.request || {};
    var uploadResponse = await fetch(request.url, {
      method: request.method || "PUT",
      headers: directUploadHeaders(request.headers, contentType),
      body: file,
    });
    if (!uploadResponse.ok) {
      throw new Error("对象存储上传失败：" + uploadResponse.status);
    }

    return fetchJson(options.completeUrl(attachment.id), {
      method: "POST",
      headers: { accept: "application/json" },
    });
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
    directUploadStatus(form, existingAttachmentId ? "正在获取上传签名..." : "正在登记附件元数据...", "info");
    try {
      await uploadAttachmentFile({
        file: file,
        filename: form.querySelector("[data-attachment-filename]")?.value || file.name,
        contentType:
          form.querySelector("[data-attachment-content-type]")?.value ||
          file.type ||
          "application/octet-stream",
        byteSize: Number(form.querySelector("[data-attachment-byte-size]")?.value || file.size || 0),
        existingAttachmentId: existingAttachmentId,
        createUrl: form.dataset.attachmentCreateUrl,
        uploadUrl: function (attachmentId) {
          return attachmentUrlFromTemplate(form.dataset.attachmentUploadUrlTemplate, attachmentId);
        },
        completeUrl: function (attachmentId) {
          return attachmentUrlFromTemplate(form.dataset.attachmentCompleteUrlTemplate, attachmentId);
        },
      });
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
    group.querySelectorAll("textarea").forEach(function (textarea) {
      textarea.value = "";
    });
    group.querySelectorAll("input[type='file']").forEach(function (input) {
      input.value = "";
    });
    var fileName = group.querySelector("[data-bug-report-image-name]");
    if (fileName) {
      fileName.textContent = "选择截图、报错页面或复现过程图片。";
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
    if (!group || !form || form.querySelectorAll("[data-bug-report-group]").length <= 1) {
      return;
    }
    group.remove();
    updateBugReportGroupTitles(form);
  }

  function syncBugReportImageName(input) {
    var group = input.closest("[data-bug-report-group]");
    var file = input.files && input.files[0];
    var label = group && group.querySelector("[data-bug-report-image-name]");
    if (!label) {
      return;
    }
    label.textContent = file
      ? "已选择 " + (file.name || "图片") + "，提交后会直传对象存储。"
      : "选择截图、报错页面或复现过程图片。";
  }

  function collectBugReportGroups(form) {
    return Array.from(form.querySelectorAll("[data-bug-report-group]"))
      .map(function (group, index) {
        var fileInput = group.querySelector("[data-bug-report-image]");
        var file = fileInput && fileInput.files ? fileInput.files[0] : null;
        var body = (group.querySelector("[data-bug-report-body]")?.value || "").trim();
        return { index: index, file: file, body: body };
      })
      .filter(function (group) {
        return Boolean(group.file || group.body);
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
    var invalidGroup = groups.find(function (group) {
      return group.file && !group.body;
    });
    if (invalidGroup) {
      bugReportStatus(form, "第 " + (invalidGroup.index + 1) + " 组已选择图片，请填写对应说明内容。", "error");
      return;
    }
    var invalidImageGroup = groups.find(function (group) {
      return group.file && group.file.type && group.file.type.indexOf("image/") !== 0;
    });
    if (invalidImageGroup) {
      bugReportStatus(form, "第 " + (invalidImageGroup.index + 1) + " 组请选择图片文件。", "error");
      return;
    }

    var formData = new FormData(form);
    setBugReportBusy(form, true);
    bugReportStatus(form, "正在创建 Bug...", "info");
    try {
      var item = await fetchJson(form.dataset.bugReportCreateUrl || "/api/v1/work-items", {
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

      for (var i = 0; i < groups.length; i += 1) {
        var group = groups[i];
        bugReportStatus(form, "正在创建第 " + (i + 1) + "/" + groups.length + " 组说明...", "info");
        var comment = await fetchJson("/api/v1/work-items/" + encodeURIComponent(item.key) + "/comments", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            accept: "application/json",
          },
          body: JSON.stringify({ body: group.body }),
        });

        if (group.file) {
          bugReportStatus(form, "正在上传第 " + (i + 1) + "/" + groups.length + " 组图片...", "info");
          await uploadAttachmentFile({
            file: group.file,
            filename: group.file.name || "bug-screenshot.png",
            contentType: group.file.type || "application/octet-stream",
            byteSize: group.file.size || 0,
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
          });
        }
      }

      bugReportStatus(form, "Bug 创建完成，正在打开详情页。", "success");
      window.setTimeout(function () {
        window.location.href = "/web/work-items/" + encodeURIComponent(item.key);
      }, 450);
    } catch (error) {
      bugReportStatus(form, error.message || "Bug 创建失败，请稍后重试。", "error");
      setBugReportBusy(form, false);
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

  function openModal(modal, trigger) {
    if (!modal) {
      return;
    }
    closeDropdowns();
    closeDrawers();
    closeModals(modal);
    modal.lastModalTrigger = trigger || document.activeElement;
    if (modal.modalCloseTimer) {
      window.clearTimeout(modal.modalCloseTimer);
    }
    if (modal.modalOpenFrame) {
      window.cancelAnimationFrame(modal.modalOpenFrame);
    }
    modal.hidden = false;
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
    modal.modalOpenFrame = window.requestAnimationFrame(function () {
      modal.modalOpenFrame = null;
      if (modal.getAttribute("aria-hidden") === "true" || modal.hidden) {
        return;
      }
      modal.classList.add("open");
      focusModal(modal);
    });
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
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
    modal.modalCloseTimer = window.setTimeout(function () {
      if (!modal.classList.contains("open")) {
        modal.hidden = true;
      }
      if (!document.querySelector("[data-modal].open")) {
        document.body.classList.remove("modal-open");
      }
      if (restoreFocus && modal.lastModalTrigger && document.contains(modal.lastModalTrigger)) {
        modal.lastModalTrigger.focus({ preventScroll: true });
      }
    }, prefersReducedMotion() ? 0 : MODAL_TRANSITION_MS);
  }

  function closeModals(exceptModal) {
    document.querySelectorAll("[data-modal].open").forEach(function (modal) {
      if (modal !== exceptModal) {
        closeModal(modal, false);
      }
    });
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
    form.submit();
  }

  applyTheme(readThemePreference());
  initUserAvatars();

  document.addEventListener("click", function (event) {
    var link = event.target.closest("a[href]");
    if (link) {
      navigateWithTransition(event, link);
      if (event.defaultPrevented) {
        return;
      }
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
      var activeModal = modalClose.closest("[data-modal]") || document.querySelector("[data-modal].open");
      closeModal(activeModal, true);
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

    var tabTrigger = event.target.closest("[data-tab-trigger]");
    if (tabTrigger) {
      event.preventDefault();
      activateTab(tabTrigger);
      syncTabUrl(tabTrigger);
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

    var currentTab = event.target.closest("[data-tab-trigger]");
    if (currentTab && ["ArrowLeft", "ArrowRight", "Home", "End"].indexOf(event.key) >= 0) {
      var tabs = Array.from(currentTab.closest("[data-tabs]").querySelectorAll("[data-tab-trigger]"));
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
        activateTab(tabs[nextIndex]);
        tabs[nextIndex].focus({ preventScroll: true });
      }
      return;
    }

    var activeModal = document.querySelector("[data-modal].open");
    if (event.key === "Tab" && activeModal) {
      var focusable = modalFocusableElements(activeModal);
      if (focusable.length === 0) {
        event.preventDefault();
        focusModal(activeModal);
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
      if (activeModal) {
        closeModal(activeModal, true);
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
    initTabs(event.target);
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
  }, true);

  document.addEventListener("submit", function (event) {
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

  ["input", "change"].forEach(function (eventName) {
    document.addEventListener(eventName, handleUsernameInput, true);
  });

  initTopbarSearch(document);
  initProjectSwitcher(document);
  document.querySelectorAll("[data-bug-report-form]").forEach(updateBugReportGroupTitles);
  initTabs(document);
})();
