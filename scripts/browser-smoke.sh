#!/usr/bin/env bash
set -Eeuo pipefail

PORT="${YUANCE_BROWSER_SMOKE_PORT:-33035}"
HOST="${YUANCE_BROWSER_SMOKE_HOST:-127.0.0.1}"
BASE_URL="http://${HOST}:${PORT}"
ROOT="${YUANCE_BROWSER_SMOKE_ROOT:-/tmp/yuance-browser-smoke}"
SESSION="${YUANCE_BROWSER_SMOKE_SESSION:-yuance-browser-smoke}"
DB_URL="sqlite://${ROOT}/yuance.sqlite3"
SECURITY_KEY="${YUANCE_SECURITY_MASTER_KEY:-test-master-key-that-is-long-enough}"
SERVER_PID=""

log() {
  printf '[browser-smoke] %s\n' "$*"
}

fail() {
  printf '[browser-smoke] ERROR: %s\n' "$*" >&2
  exit 1
}

run_with_timeout() {
  local seconds="$1"
  shift
  "$@" &
  local pid="$!"
  local elapsed=0
  while kill -0 "$pid" >/dev/null 2>&1; do
    if [ "$elapsed" -ge "$seconds" ]; then
      kill "$pid" >/dev/null 2>&1 || true
      wait "$pid" >/dev/null 2>&1 || true
      return 124
    fi
    sleep 1
    elapsed=$((elapsed + 1))
  done
  wait "$pid"
}

cleanup() {
  run_with_timeout 10 agent-browser --session "$SESSION" close >/dev/null 2>&1 || true
  if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" >/dev/null 2>&1; then
    kill "$SERVER_PID" >/dev/null 2>&1 || true
    wait "$SERVER_PID" >/dev/null 2>&1 || true
  fi
}

ab() {
  local attempt=1
  local status=0
  while true; do
    if [ "${YUANCE_BROWSER_SMOKE_HEADED:-0}" = "1" ]; then
      AGENT_BROWSER_HEADED=1 agent-browser --session "$SESSION" "$@" && return 0
    else
      agent-browser --session "$SESSION" "$@" && return 0
    fi
    status=$?
    if [ "$attempt" -ge 3 ]; then
      return "$status"
    fi
    log "agent-browser 命令失败，准备重试 ${attempt}/3：$*"
    sleep 1
    attempt=$((attempt + 1))
  done
}

wait_for_text() {
  ab wait --text "$1" >/dev/null
}

best_effort_screenshot() {
  run_with_timeout 20 agent-browser --session "$SESSION" screenshot --full --screenshot-dir "$ROOT" >/dev/null 2>&1 \
    || log "截图失败或超时，跳过截图收尾"
}

trap cleanup EXIT

command -v cargo >/dev/null 2>&1 || fail "未找到 cargo"
command -v curl >/dev/null 2>&1 || fail "未找到 curl"
command -v sqlite3 >/dev/null 2>&1 || fail "未找到 sqlite3"
command -v agent-browser >/dev/null 2>&1 || fail "未找到 agent-browser，请先安装并执行 agent-browser install"
agent-browser --session "$SESSION" close >/dev/null 2>&1 || true

if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  fail "端口 ${PORT} 已被占用；可通过 YUANCE_BROWSER_SMOKE_PORT 指定其他端口"
fi

rm -rf "$ROOT"
mkdir -p "$ROOT"

log "准备临时数据库 ${DB_URL}"
YUANCE_DATABASE_URL="$DB_URL" \
YUANCE_DATA_DIR="$ROOT" \
YUANCE_ENV=test \
YUANCE_SECURITY_MASTER_KEY="$SECURITY_KEY" \
YUANCE_LOG_LEVEL=off \
  cargo run -p yuance-api -- migrate up

YUANCE_DATABASE_URL="$DB_URL" \
YUANCE_DATA_DIR="$ROOT" \
YUANCE_ENV=test \
YUANCE_SECURITY_MASTER_KEY="$SECURITY_KEY" \
YUANCE_LOG_LEVEL=off \
  cargo run -p yuance-api -- seed local-admin

log "启动临时服务 ${BASE_URL}"
YUANCE_HTTP_ADDR="${HOST}:${PORT}" \
YUANCE_DATABASE_URL="$DB_URL" \
YUANCE_DATA_DIR="$ROOT" \
YUANCE_ENV=test \
YUANCE_SECURITY_MASTER_KEY="$SECURITY_KEY" \
YUANCE_LOG_LEVEL=off \
  cargo run -p yuance-api -- serve >"${ROOT}/server.log" 2>&1 &
SERVER_PID="$!"

for _ in $(seq 1 80); do
  if curl -fsS "${BASE_URL}/api/healthz" >/dev/null 2>&1; then
    break
  fi
  sleep 0.25
done
curl -fsS "${BASE_URL}/api/healthz" >/dev/null || fail "服务未在 ${BASE_URL} 启动，日志：${ROOT}/server.log"

log "执行浏览器交互脚本"
EVAL_FILE="${ROOT}/browser-smoke.eval.js"
cat >"$EVAL_FILE" <<JS
(async () => {
  const baseUrl = "${BASE_URL}";
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function assert(condition, message) {
    if (!condition) {
      throw new Error(message);
    }
  }

  async function waitFor(predicate, message, timeout = 10000) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeout) {
      if (predicate()) {
        return;
      }
      await sleep(100);
    }
    throw new Error(message);
  }

  const loginResponse = await fetch("/api/v1/auth/login", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ username: "yuance_admin", password: "Yuance@2026Dev!" }),
  });
  assert(loginResponse.ok, "API 登录失败");

  const frame = document.createElement("iframe");
  frame.style.width = "1280px";
  frame.style.height = "900px";
  frame.style.border = "0";
  document.body.innerHTML = "";
  document.body.appendChild(frame);

  function frameDocument() {
    assert(frame.contentDocument, "iframe 文档不可访问");
    return frame.contentDocument;
  }

  function text() {
    return frameDocument().body.innerText;
  }

  function hasText(value) {
    return text().includes(value);
  }

  function query(selector) {
    const element = frameDocument().querySelector(selector);
    assert(element, "未找到元素：" + selector);
    return element;
  }

  function click(selector) {
    query(selector).click();
  }

  function fill(selector, value) {
    const element = query(selector);
    element.value = value;
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function visible(selector) {
    const element = query(selector);
    return !element.hidden && element.offsetParent !== null;
  }

  async function waitForFrameNavigation(previousDocument, action, timeout = 10000) {
    await waitFor(() => {
      const currentDocument = frame.contentDocument;
      return currentDocument && currentDocument !== previousDocument && currentDocument.readyState === "complete";
    }, "等待页面加载超时：" + action, timeout);
    await sleep(120);
  }

  async function open(path) {
    const previousDocument = frame.contentDocument;
    frame.src = baseUrl + path;
    await waitForFrameNavigation(previousDocument, "打开 " + path);
  }

  async function submitAndWait(selector) {
    const previousDocument = frame.contentDocument;
    click(selector);
    await waitForFrameNavigation(previousDocument, "提交 " + selector);
  }

  await open("/web");
  assert(hasText("工作台"), "工作台未渲染");
  const dashboardSegmented = query("[data-segmented]");
  const initialSegmentedX = dashboardSegmented.style.getPropertyValue("--segmented-indicator-x");
  click("[data-segmented-item][hx-get*='kind=requirement']");
  await waitFor(() => query("[data-segmented-item][hx-get*='kind=requirement']").classList.contains("active"), "工作台筛选 Tab 未激活");
  assert(dashboardSegmented.style.getPropertyValue("--segmented-indicator-x") !== initialSegmentedX, "工作台筛选 Tab 滑块未移动");
  assert(getComputedStyle(query("[data-segmented-indicator]")).transitionDuration.includes("0.22s"), "工作台筛选 Tab 未应用滑块动画");

  const systemTrigger = query(".topnav-trigger");
  systemTrigger.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
  await waitFor(() => visible(".topnav-menu"), "系统管理二级菜单 hover 后未打开");
  const systemMenu = query(".topnav-menu");
  systemMenu.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
  await sleep(320);
  assert(visible(".topnav-menu"), "鼠标移动到二级菜单卡片后菜单过早关闭");
  systemTrigger.dispatchEvent(new MouseEvent("mouseleave", { bubbles: true }));
  systemMenu.dispatchEvent(new MouseEvent("mouseleave", { bubbles: true }));

  click(".account-trigger");
  await waitFor(() => visible(".account-menu"), "用户菜单点击后未打开");
  click("[data-theme-toggle]");
  await waitFor(
    () => frameDocument().documentElement.dataset.theme === "dark",
    "暗色主题未生效",
  );
  await open("/web/system/roles");
  assert(frameDocument().documentElement.dataset.theme === "dark", "暗色主题跨页面未保持");
  assert(hasText("角色权限"), "暗色主题下角色权限页未渲染");
  click(".account-trigger");
  click("[data-theme-toggle]");
  await waitFor(
    () => frameDocument().documentElement.dataset.theme === "light",
    "亮色主题未恢复",
  );

  await open("/web/system/roles");
  assert(hasText("权限树"), "角色权限页未渲染权限树");
  click("[data-modal-open='role-create-modal']");
  await waitFor(() => visible("#role-create-modal"), "角色创建 modal 未打开");
  assert(!query("#role-create-modal input[name='role_code']").disabled, "角色创建 modal 输入框不可交互");
  click("#role-create-modal [data-modal-close]");
  await waitFor(() => query("#role-create-modal").hidden, "角色创建 modal 未关闭");
  click("[data-modal-open='role-create-modal']");
  fill("#role-create-modal input[name='role_code']", "smoke_viewer");
  fill("#role-create-modal input[name='role_name']", "冒烟观察者");
  await submitAndWait("#role-create-modal button[type='submit'].btn-primary");
  assert(frame.contentWindow.location.pathname === "/web/system/roles", "角色创建后未停留角色权限页");
  assert(frame.contentWindow.location.search.includes("role=smoke_viewer"), "角色创建后未选中新角色");
  assert(hasText("冒烟观察者"), "新建角色未出现在角色列表");
  const projectGroup = query("[data-permission-group-key='project']");
  const groupParent = projectGroup.querySelector(".permission-group-head input[data-permission-parent]");
  assert(groupParent, "未找到项目权限组父级复选框");
  groupParent.click();
  assert(
    Array.from(projectGroup.querySelectorAll("input[data-permission-node]")).every((item) => item.checked),
    "权限组父级勾选未联动子权限",
  );
  await submitAndWait("[data-permission-tree] button[type='submit']");
  assert(hasText("冒烟观察者"), "保存权限后角色页未正常返回");

  await open("/web/system/users");
  click("[data-modal-open='user-create-modal']");
  await waitFor(() => visible("#user-create-modal"), "用户创建 modal 未打开");
  fill("#user-create-modal input[name='username']", "smoke_user");
  fill("#user-create-modal input[name='display_name']", "冒烟成员");
  fill("#user-create-modal input[name='email']", "smoke-user@example.test");
  fill("#user-create-modal input[name='mobile']", "13800000001");
  fill("#user-create-modal input[name='password']", "SmokeUser2026!");
  fill("#user-create-modal select[name='role_code']", "member");
  await submitAndWait("#user-create-modal button[type='submit'].btn-primary");
  assert(frame.contentWindow.location.pathname === "/web/system/users", "用户创建后未回到用户管理页");
  assert(hasText("冒烟成员"), "新用户未出现在用户列表");

  click("[data-modal-open='user-role-modal-smoke_user']");
  await waitFor(() => visible("#user-role-modal-smoke_user"), "用户角色 modal 未打开");
  fill("#user-role-modal-smoke_user select[name='role_code']", "smoke_viewer");
  await submitAndWait("#user-role-modal-smoke_user button[type='submit'].btn-primary");
  assert(hasText("冒烟观察者"), "调整用户角色后未显示新角色");

  click("[data-modal-open='user-password-modal-smoke_user']");
  await waitFor(() => visible("#user-password-modal-smoke_user"), "重置密码 modal 未打开");
  fill("#user-password-modal-smoke_user input[name='password']", "SmokeReset2026!");
  await submitAndWait("#user-password-modal-smoke_user button[type='submit'].btn-primary");
  assert(hasText("冒烟成员"), "重置密码后用户管理页未正常返回");

  await open("/web/me");
  click("[data-modal-open='me-profile-modal']");
  await waitFor(() => visible("#me-profile-modal"), "编辑个人资料 modal 未打开");
  fill("#me-profile-modal input[name='display_name']", "冒烟管理员");
  fill("#me-profile-modal input[name='email']", "smoke-admin@example.test");
  fill("#me-profile-modal input[name='mobile']", "13800000002");
  await submitAndWait("#me-profile-modal button[type='submit'].btn-primary");
  assert(hasText("冒烟管理员"), "个人资料保存后未展示新显示名称");

  click("[data-modal-open='me-password-modal']");
  await waitFor(() => visible("#me-password-modal"), "修改密码 modal 未打开");
  fill("#me-password-modal input[name='current_password']", "Yuance@2026Dev!");
  fill("#me-password-modal input[name='new_password']", "YuanceSmoke2026!");
  fill("#me-password-modal input[name='new_password_confirm']", "YuanceSmoke2026!");
  await submitAndWait("#me-password-modal button[type='submit'].btn-primary");
  assert(hasText("冒烟管理员"), "修改密码后我的页面未正常返回");

  await open("/web/system/storage");
  click("[data-modal-open='storage-config-modal']");
  assert(hasText("编辑阿里云 OSS 配置"), "对象存储 modal 未打开");
  fill("#storage-config-modal input[name='endpoint']", "memory://yuance-tests");
  fill("#storage-config-modal input[name='region']", "test");
  fill("#storage-config-modal input[name='bucket']", "yuance-smoke-a");
  fill("#storage-config-modal input[name='access_key_id']", "AKIASMOKEAKEYID");
  fill("#storage-config-modal input[name='access_key_secret']", "SmokeASecret2026!");
  await submitAndWait("#storage-config-modal button[name='activate'][value='on']");
  assert(hasText("对象存储配置已保存"), "第一版对象存储配置未保存");

  click("[data-modal-open='storage-config-modal']");
  fill("#storage-config-modal input[name='endpoint']", "memory://yuance-tests");
  fill("#storage-config-modal input[name='region']", "test");
  fill("#storage-config-modal input[name='bucket']", "yuance-smoke-b");
  fill("#storage-config-modal input[name='access_key_id']", "AKIASMOKEBKEYID");
  fill("#storage-config-modal input[name='access_key_secret']", "SmokeBSecret2026!");
  await submitAndWait("#storage-config-modal button[name='activate'][value='on']");
  assert(hasText("配置版本"), "配置版本列表未渲染");
  click("form[action='/web/system/storage/versions/1/rollback'] button[type='submit']");
  assert(hasText("确认回滚到 v1"), "回滚确认弹窗未打开");
  await submitAndWait("[data-confirm-submit]");
  assert(hasText("已回滚到 v1 的配置快照"), "对象存储回滚未成功");

  await open("/web/projects");
  click("[data-modal-open='project-create-modal']");
  assert(hasText("新建项目"), "项目创建 modal 未打开");
  fill("#project-create-modal input[name='name']", "浏览器冒烟项目");
  fill("#project-create-modal textarea[name='description']", "用于验证元策关键浏览器交互。");
  await submitAndWait("#project-create-modal button[type='submit'].btn-primary");
  const projectKey = frame.contentWindow.location.pathname.split("/").pop();
  assert(/^P\d{12}$/.test(projectKey), "项目创建后未生成预期项目编号：" + projectKey);
  assert(frame.contentWindow.location.pathname === "/web/projects/" + projectKey, "项目创建后未跳转详情");
  assert(hasText("浏览器冒烟项目"), "项目详情未显示新项目");

  const projectTabs = query("[data-tabs]");
  const projectTabList = query(".project-tab-list");
  const projectTabBadge = query("[data-tab-key='work'] span");
  const topnavBadgeReference = frameDocument().createElement("span");
  topnavBadgeReference.className = "topnav-badge";
  frameDocument().body.appendChild(topnavBadgeReference);
  const initialIndicatorX = projectTabList.style.getPropertyValue("--tab-indicator-x");
  assert(query("[data-tab-indicator]"), "项目 Tabs 未渲染活动滑块");
  assert(getComputedStyle(projectTabBadge).position === "absolute", "项目 Tab 角标未定位到右上角");
  assert(getComputedStyle(projectTabBadge).backgroundColor === getComputedStyle(topnavBadgeReference).backgroundColor, "项目 Tab 角标未复用顶部红色角标");
  topnavBadgeReference.remove();
  click("[data-tab-key='info']");
  await waitFor(() => query("[data-tab-key='info']").classList.contains("active"), "项目详情 Tab 未激活");
  assert(
    projectTabList.style.getPropertyValue("--tab-indicator-x") !== initialIndicatorX,
    "项目 Tabs 活动滑块未移动",
  );
  assert(
    getComputedStyle(query("[data-tab-indicator]")).transitionDuration.includes("0.22s"),
    "项目 Tabs 活动滑块未应用过渡动画",
  );
  assert(projectTabs.querySelector("[data-tab-panel].active")?.id === "project-tab-info", "项目 Tab 面板未同步");

  await open("/web/projects/" + projectKey + "?tab=members");
  click("[data-modal-open='project-member-add-modal']");
  await waitFor(() => visible("#project-member-add-modal"), "项目成员添加 modal 未打开");
  fill("#project-member-user-search", "smoke_user");
  await waitFor(
    () => !query("#project-member-user-options [data-user-option][data-username='smoke_user']").hidden,
    "项目成员候选用户未出现",
  );
  click("#project-member-user-options [data-user-option][data-username='smoke_user']");
  await waitFor(
    () => query("#project-member-add-modal input[name='username']").value === "smoke_user",
    "项目成员候选用户未选中",
  );
  fill("#project-member-add-modal select[name='member_role']", "member");
  await submitAndWait("#project-member-add-modal button[type='submit'].btn-primary");
  await open("/web/projects/" + projectKey + "?tab=members");
  assert(hasText("冒烟成员"), "项目成员添加后未显示新成员");

  click("[data-modal-open='project-member-role-modal-smoke_user']");
  await waitFor(() => visible("#project-member-role-modal-smoke_user"), "项目成员角色 modal 未打开");
  fill("#project-member-role-modal-smoke_user select[name='member_role']", "viewer");
  await submitAndWait("#project-member-role-modal-smoke_user button[type='submit'].btn-primary");
  await open("/web/projects/" + projectKey + "?tab=members");
  assert(hasText("冒烟成员"), "项目成员角色调整后未保留成员");
  assert(hasText("只读成员"), "项目成员角色调整后未显示只读成员角色");

  await open("/web");
  click(".project-switcher-trigger");
  await waitFor(() => visible(".project-switcher-panel"), "当前项目下拉未打开");
  fill("#topbar-project-search", "没有这个项目");
  await waitFor(() => hasText("没有匹配项目"), "当前项目下拉空状态未显示");
  fill("#topbar-project-search", "浏览器冒烟项目");
  await submitAndWait("[data-project-option][data-project-key='" + projectKey + "']");
  assert(hasText("浏览器冒烟项目"), "当前项目切换未生效");

  frame.contentWindow.localStorage.setItem(
    "yuance-search-history",
    JSON.stringify(["登录失败", "附件上传", "项目进度", "任务指派", "移动端", "应被截断"]),
  );
  const globalSearch = query("[data-topbar-search-input]");
  globalSearch.dispatchEvent(new FocusEvent("focus"));
  await waitFor(() => visible("[data-search-history]"), "最近搜索面板未打开");
  assert(query("[data-search-history-list]").querySelectorAll("button").length === 5, "最近搜索未限制为 5 条");
  globalSearch.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

  await open("/web/tasks");
  click("[data-modal-open='work-item-create-modal']");
  assert(hasText("新建任务"), "任务创建 modal 未打开");
  const assigneeControl = query("#work-item-create-modal select[name='assignee_username']").nextElementSibling;
  assert(assigneeControl?.matches(".select-control"), "任务处理人未增强为共享选择器");
  assigneeControl.querySelector(".select-control-trigger").click();
  assert(assigneeControl.selectPanel && !assigneeControl.selectPanel.hidden, "可搜索处理人下拉未打开");
  assert(assigneeControl.selectPanel.querySelector(".select-control-search"), "处理人下拉缺少搜索输入");
  frame.contentWindow.document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  fill("#work-item-create-modal input[name='title']", "浏览器冒烟任务");
  fill("#work-item-create-modal textarea[name='description']", "覆盖 modal、直接上传和确认弹窗。");
  const composerInput = query("#work-item-create-modal [data-bug-report-image]");
  const composerFiles = new DataTransfer();
  composerFiles.items.add(new File(["alpha"], "smoke-note-a.txt", { type: "text/plain" }));
  composerFiles.items.add(new File(["beta"], "smoke-note-b.txt", { type: "text/plain" }));
  composerInput.files = composerFiles.files;
  composerInput.dispatchEvent(new Event("change", { bubbles: true }));
  assert(query("#work-item-create-modal [data-composer-file-list]").children.length === 2, "任务创建器未渲染两个附件");
  await submitAndWait("#work-item-create-modal button[type='submit'].btn-primary");
  const taskKey = projectKey + "-TASK-1";
  assert(frame.contentWindow.location.pathname === "/web/work-items/" + taskKey, "任务创建后未跳转详情");
  assert(hasText("浏览器冒烟任务"), "任务详情未显示新任务");

  return "browser smoke setup passed";
})()
JS
ab open "${BASE_URL}/web/login" >/dev/null
if [ "${YUANCE_BROWSER_SMOKE_HEADED:-0}" = "1" ]; then
  AGENT_BROWSER_HEADED=1 agent-browser --session "$SESSION" eval "$(cat "$EVAL_FILE")"
else
  agent-browser --session "$SESSION" eval "$(cat "$EVAL_FILE")"
fi

log "执行讨论附件直传与内联进度验证"
smoke_task_key="$(
  sqlite3 "${ROOT}/yuance.sqlite3" \
    "SELECT item_key FROM work_items WHERE title = '浏览器冒烟任务' ORDER BY id DESC LIMIT 1;"
)"
if [ -z "$smoke_task_key" ]; then
  fail "未找到浏览器冒烟任务"
fi
ab open "${BASE_URL}/web/work-items/${smoke_task_key}" >/dev/null
UPLOAD_EVAL_FILE="${ROOT}/browser-smoke-upload.eval.js"
cat >"$UPLOAD_EVAL_FILE" <<'JS'
(async () => {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function assert(condition, message) {
    if (!condition) {
      throw new Error(message);
    }
  }

  function text() {
    return document.body.innerText;
  }

  function query(selector) {
    const element = document.querySelector(selector);
    assert(element, "未找到元素：" + selector);
    return element;
  }

  const workItemKey = window.location.pathname.split("/").pop();

  async function waitFor(predicate, message, timeout = 15000) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeout) {
      if (predicate()) {
        return;
      }
      await sleep(100);
    }
    throw new Error(message);
  }

  assert(text().includes("浏览器冒烟任务"), "任务详情未打开");

  const form = query("[data-discussion-form]:not(.discussion-reply-form)");
  const input = query("[data-discussion-form]:not(.discussion-reply-form) [data-discussion-files]");
  query("[data-discussion-form]:not(.discussion-reply-form) [data-discussion-body]").value = "附上浏览器冒烟截图";
  const pngBytes = Uint8Array.from(
    atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLJ/QAAAABJRU5ErkJggg=="),
    (character) => character.charCodeAt(0),
  );
  const file = new File([pngBytes], "smoke-screenshot-original.png", { type: "image/png" });
  const dataTransfer = new DataTransfer();
  dataTransfer.items.add(file);
  input.files = dataTransfer.files;
  input.dispatchEvent(new Event("change", { bubbles: true }));

  await waitFor(() => text().includes("已选择 1 个附件"), "附件选择状态未更新");
  await waitFor(() => {
    const preview = form.querySelector("[data-local-image-preview] img");
    return preview && preview.src.startsWith("blob:");
  }, "图片本地预览未生成");
  form.querySelector("[data-local-image-preview]").click();
  const localViewer = query("[data-image-viewer]");
  await waitFor(() => localViewer.classList.contains("open"), "本地图片查看器未打开");
  query("[data-image-viewer] [data-modal-close]").click();
  await waitFor(() => localViewer.hidden, "本地图片查看器未关闭");

  const transfer = form.querySelector("[data-upload-transfer]");
  assert(transfer && !transfer.hidden && transfer.textContent.includes("0%"), "上传进度环未显示准备状态");
  assert(transfer.closest("[data-discussion-form]") === form, "上传进度未显示在当前讨论编辑器内");
  assert(form.checkValidity(), "讨论表单校验未通过");

  let observedProgress = false;
  const progressObserver = new MutationObserver(() => {
    const ring = form.querySelector("[data-upload-progress-ring]");
    if (ring && ring.getAttribute("aria-valuenow") === "50") {
      observedProgress = true;
    }
  });
  progressObserver.observe(form, { childList: true, subtree: true, attributes: true });
  const NativeXMLHttpRequest = window.XMLHttpRequest;
  window.XMLHttpRequest = function () {
    const listeners = {};
    this.upload = {
      addEventListener(type, callback) {
        listeners["upload:" + type] = callback;
      },
    };
    this.open = () => {};
    this.setRequestHeader = () => {};
    this.addEventListener = (type, callback) => {
      listeners[type] = callback;
    };
    this.send = () => {
      window.setTimeout(() => {
        listeners["upload:progress"]?.({ lengthComputable: true, loaded: 1, total: 2 });
        window.setTimeout(() => listeners.error?.(new Event("error")), 120);
      }, 0);
    };
  };
  form.requestSubmit(form.querySelector("[data-discussion-submit]"));
  await waitFor(() => observedProgress, "上传进度环未响应真实字节进度");
  await waitFor(() => text().includes("对象存储上传连接失败"), "附件上传失败状态未显示");
  progressObserver.disconnect();
  const failedAttachmentId = form.bugReportFiles?.[0]?.attachmentId;
  assert(failedAttachmentId, "上传失败后未保留待上传附件");
  assert(form.dataset.discussionCommentId, "上传失败后未保留已发表内容");
  window.XMLHttpRequest = NativeXMLHttpRequest;

  form.requestSubmit(form.querySelector("[data-discussion-submit]"));
  await waitFor(() => text().includes("附件上传完成"), "附件直传未完成", 20000);

  const detailResponse = await fetch(`/web/work-items/${workItemKey}`, {
    credentials: "same-origin",
  });
  assert(detailResponse.ok, "上传后刷新任务详情失败");
  const detailHtml = await detailResponse.text();
  assert(detailHtml.includes("smoke-screenshot-original.png"), "任务详情未渲染已上传附件");
  assert(detailHtml.includes("附上浏览器冒烟截图"), "任务详情未保留附件所属发表内容");
  assert(detailHtml.includes("下载"), "任务详情未提供已上传附件下载入口");

  return "browser smoke upload passed";
})()
JS
if [ "${YUANCE_BROWSER_SMOKE_HEADED:-0}" = "1" ]; then
  AGENT_BROWSER_HEADED=1 agent-browser --session "$SESSION" eval "$(cat "$UPLOAD_EVAL_FILE")"
else
  agent-browser --session "$SESSION" eval "$(cat "$UPLOAD_EVAL_FILE")"
fi

uploaded_count="$(
  sqlite3 "${ROOT}/yuance.sqlite3" \
    "SELECT COUNT(*) FROM file_objects WHERE original_filename = 'smoke-screenshot-original.png' AND status = 'uploaded';"
)"
if [ "$uploaded_count" != "1" ]; then
  fail "附件直传后数据库未记录 uploaded 状态"
fi

log "验证已上传图片预览与查看器"
ab open "${BASE_URL}/web/work-items/${smoke_task_key}" >/dev/null
GALLERY_SEED_EVAL_FILE="${ROOT}/browser-smoke-gallery-seed.eval.js"
cat >"$GALLERY_SEED_EVAL_FILE" <<'JS'
(async () => {
  function assert(condition, message) {
    if (!condition) {
      throw new Error(message);
    }
  }

  const workItemKey = window.location.pathname.split("/").pop();
  const csrf = document.querySelector("meta[name='yuance-csrf-token']")?.getAttribute("content") || "";
  const pngBytes = Uint8Array.from(
    atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLJ/QAAAABJRU5ErkJggg=="),
    (character) => character.charCodeAt(0),
  );
  const createResponse = await fetch(`/api/v1/work-items/${workItemKey}/attachments`, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      "x-yuance-csrf-token": csrf,
    },
    body: JSON.stringify({
      original_filename: "smoke-screenshot-gallery.png",
      content_type: "image/png",
      byte_size: pngBytes.byteLength,
    }),
  });
  assert(createResponse.ok, "图库测试附件登记失败");
  const attachment = (await createResponse.json()).data;
  const signingResponse = await fetch(
    `/api/v1/work-items/${workItemKey}/attachments/${attachment.id}/upload-url`,
    { credentials: "same-origin", headers: { accept: "application/json" } },
  );
  assert(signingResponse.ok, "图库测试附件签名失败");
  const request = (await signingResponse.json()).data.request;
  const headers = Object.fromEntries(request.headers || []);
  headers["x-yuance-csrf-token"] = csrf;
  const uploadResponse = await fetch(request.url, {
    method: request.method || "PUT",
    credentials: "same-origin",
    headers,
    body: pngBytes,
  });
  assert(uploadResponse.ok, "图库测试附件直传失败");
  const completeResponse = await fetch(
    `/api/v1/work-items/${workItemKey}/attachments/${attachment.id}/uploaded`,
    {
      method: "POST",
      credentials: "same-origin",
      headers: { accept: "application/json", "x-yuance-csrf-token": csrf },
    },
  );
  assert(completeResponse.ok, "图库测试附件确认失败");
  return "browser smoke gallery seed passed";
})()
JS
if [ "${YUANCE_BROWSER_SMOKE_HEADED:-0}" = "1" ]; then
  AGENT_BROWSER_HEADED=1 agent-browser --session "$SESSION" eval "$(cat "$GALLERY_SEED_EVAL_FILE")"
else
  agent-browser --session "$SESSION" eval "$(cat "$GALLERY_SEED_EVAL_FILE")"
fi
ab open "${BASE_URL}/web/work-items/${smoke_task_key}" >/dev/null
IMAGE_PREVIEW_EVAL_FILE="${ROOT}/browser-smoke-image-preview.eval.js"
cat >"$IMAGE_PREVIEW_EVAL_FILE" <<'JS'
(async () => {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function assert(condition, message) {
    if (!condition) {
      throw new Error(message);
    }
  }

  function query(selector) {
    const element = document.querySelector(selector);
    assert(element, "未找到元素：" + selector);
    return element;
  }

  async function waitFor(predicate, message, timeout = 15000) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeout) {
      if (predicate()) {
        return;
      }
      await sleep(100);
    }
    throw new Error(message);
  }

  const previews = Array.from(document.querySelectorAll("[data-image-preview]"));
  assert(previews.length === 2, "任务详情未渲染两张图片缩略图");
  const preview = previews[0];
  assert(preview.dataset.imageSource.includes("/download"), "图片预览未使用受鉴权下载入口");
  assert(getComputedStyle(preview).cursor === "pointer", "图片缩略图未使用手型光标");
  assert(
    getComputedStyle(preview.querySelector("[data-image-preview-image]")).cursor === "pointer",
    "图片缩略图内容未继承手型光标",
  );
  for (const item of previews) {
    item.scrollIntoView({ block: "center" });
    await waitFor(
      () => item.dataset.imagePreviewState === "ready",
      "图片缩略图未在滚入视口后加载",
    );
  }
  preview.click();
  const viewer = query("[data-image-viewer]");
  await waitFor(() => viewer.classList.contains("open"), "图片查看器未打开");

  const viewerImage = query("[data-image-viewer-image]");
  await waitFor(() => viewerImage.dataset.state === "ready", "查看器图片未加载");
  const viewerShell = query("[data-image-viewer] .image-viewer-shell");
  const viewerStage = query("[data-image-viewer] .image-viewer-stage");
  const viewerToolbar = query("[data-image-viewer] .image-viewer-toolbar");
  assert(
    viewerStage.getBoundingClientRect().width / viewerShell.getBoundingClientRect().width > 0.98,
    "查看器图片舞台未占满蒙版空间",
  );
  assert(
    getComputedStyle(viewerShell).transitionDuration.includes("0.24s"),
    "图片查看器未应用弹出过渡动画",
  );
  assert(getComputedStyle(viewerShell).backgroundColor === "rgba(0, 0, 0, 0)", "图片查看器仍存在实体容器背景");
  const toolbarRect = viewerToolbar.getBoundingClientRect();
  assert(
    Math.abs(toolbarRect.left + toolbarRect.width / 2 - window.innerWidth / 2) < 2,
    "图片操作工具栏未在底部居中",
  );
  assert(window.innerHeight - toolbarRect.bottom >= 15, "图片操作工具栏距离视口底部过近");
  assert(viewerToolbar.querySelectorAll("button").length === 7, "图片操作按钮未统一放入底部工具栏");
  const initialTitle = query("[data-image-viewer-title]").textContent;
  query("[data-image-viewer-action='next']").click();
  await waitFor(
    () => query("[data-image-viewer-title]").textContent !== initialTitle,
    "图片查看器未切换到下一张",
  );
  assert(query("[data-image-viewer-status]").textContent.includes("2 / 2"), "图片查看器未显示图库位置");
  query("[data-image-viewer-action='zoom-in']").click();
  assert(viewerImage.style.transform.includes("scale(1.25)"), "图片放大控制未生效");
  query("[data-image-viewer-action='rotate']").click();
  assert(viewerImage.style.transform.includes("rotate(90deg)"), "图片旋转控制未生效");
  query("[data-image-viewer-action='reset']").click();
  assert(viewerImage.style.transform.includes("scale(1) rotate(0deg)"), "图片重置控制未生效");
  const viewerPanel = query("[data-image-viewer] .image-viewer-shell");
  viewerPanel.focus();
  viewerPanel.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  assert(!viewer.classList.contains("open") && !viewer.hidden, "图片查看器关闭动画未保留过渡阶段");
  await waitFor(() => viewer.hidden, "Escape 未关闭图片查看器");

  assert(!document.querySelector("form[data-confirm-title='删除工作项']"), "工作项详情仍暴露删除入口");
  assert(document.querySelector(".work-item-action-rail"), "工作项固定操作栏未渲染");
  assert(getComputedStyle(document.querySelector(".work-item-action-rail")).position === "sticky", "桌面操作栏未固定");

  const replyToggle = query("[data-discussion-reply-toggle]");
  replyToggle.click();
  const replyForm = query("#" + replyToggle.dataset.discussionReplyToggle);
  assert(!replyForm.hidden, "回复编辑器未展开");
  assert(replyForm.querySelector("input[name='parent_comment_id']")?.value, "回复未关联父级内容");

  return "browser smoke image preview passed";
})()
JS
if [ "${YUANCE_BROWSER_SMOKE_HEADED:-0}" = "1" ]; then
  AGENT_BROWSER_HEADED=1 agent-browser --session "$SESSION" eval "$(cat "$IMAGE_PREVIEW_EVAL_FILE")"
else
  agent-browser --session "$SESSION" eval "$(cat "$IMAGE_PREVIEW_EVAL_FILE")"
fi

log "检查浏览器控制台错误"
errors="$(ab errors || true)"
if printf '%s\n' "$errors" | grep -Eiq 'error|exception|failed'; then
  printf '%s\n' "$errors" >&2
  fail "发现浏览器错误"
fi

best_effort_screenshot
log "通过；截图和服务日志保留在 ${ROOT}"
