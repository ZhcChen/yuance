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
printf 'browser smoke attachment\n' >"${ROOT}/smoke-attachment.txt"

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

  function waitLoad(timeout = 10000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("等待页面加载超时")), timeout);
      frame.addEventListener(
        "load",
        () => {
          clearTimeout(timer);
          setTimeout(resolve, 120);
        },
        { once: true },
      );
    });
  }

  async function open(path) {
    const loading = waitLoad();
    frame.src = baseUrl + path;
    await loading;
  }

  async function submitAndWait(selector) {
    const loading = waitLoad();
    click(selector);
    await loading;
  }

  await open("/web");
  assert(hasText("工作台"), "工作台未渲染");

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

  await open("/web/projects/" + projectKey + "?tab=members");
  click("[data-modal-open='project-member-add-modal']");
  await waitFor(() => visible("#project-member-add-modal"), "项目成员添加 modal 未打开");
  fill("#project-member-add-modal input[name='username']", "smoke_user");
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
  assert(hasText("观察者"), "项目成员角色调整后未显示观察者角色");

  await open("/web");
  click(".project-switcher-trigger");
  await waitFor(() => visible(".project-switcher-panel"), "当前项目下拉未打开");
  fill("#topbar-project-search", "没有这个项目");
  await waitFor(() => hasText("没有匹配项目"), "当前项目下拉空状态未显示");
  fill("#topbar-project-search", "浏览器冒烟项目");
  await submitAndWait("[data-project-option][data-project-key='" + projectKey + "']");
  assert(hasText("浏览器冒烟项目"), "当前项目切换未生效");

  await open("/web/tasks");
  click("[data-modal-open='work-item-create-modal']");
  assert(hasText("新建任务"), "任务创建 modal 未打开");
  fill("#work-item-create-modal input[name='title']", "浏览器冒烟任务");
  fill("#work-item-create-modal textarea[name='description']", "覆盖 modal、直接上传和确认弹窗。");
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

log "执行真实页面附件直传"
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

  query("[data-modal-open='work-item-attachment-modal']").click();
  await waitFor(() => text().includes("上传工作项附件"), "附件上传 modal 未打开");

  const form = query("#work-item-attachment-modal form[data-direct-upload]");
  const input = query("#work-item-attachment-modal input[type='file']");
  const file = new File(["browser smoke attachment\n"], "smoke-attachment.txt", {
    type: "text/plain",
  });
  const dataTransfer = new DataTransfer();
  dataTransfer.items.add(file);
  input.files = dataTransfer.files;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));

  await waitFor(() => text().includes("已选择 smoke-attachment.txt"), "附件选择状态未更新");
  assert(form.checkValidity(), "附件上传表单校验未通过");

  form.requestSubmit(query("#work-item-attachment-modal [data-upload-submit]"));
  await waitFor(() => text().includes("附件上传完成"), "附件直传未完成", 20000);

  const detailResponse = await fetch(`/web/work-items/${workItemKey}`, {
    credentials: "same-origin",
  });
  assert(detailResponse.ok, "上传后刷新任务详情失败");
  const detailHtml = await detailResponse.text();
  assert(detailHtml.includes("smoke-attachment.txt"), "任务详情未渲染已上传附件");
  assert(detailHtml.includes("uploaded"), "任务详情未显示附件 uploaded 状态");

  query("form[data-confirm-title='删除工作项'] button[type='submit']").click();
  await waitFor(() => text().includes(`确认删除 ${workItemKey}`), "删除确认弹窗未打开");
  const deleteForm = query("form[data-confirm-title='删除工作项']");
  const csrf = deleteForm.querySelector("input[name='_csrf']")?.value || "";
  const deleteResponse = await fetch(deleteForm.action, {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ _csrf: csrf }),
  });
  assert(deleteResponse.ok, "删除工作项提交失败");
  const deleteHtml = await deleteResponse.text();
  assert(deleteHtml.includes("工作项已删除"), "删除工作项后未显示删除状态");

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
    "SELECT COUNT(*) FROM file_objects WHERE original_filename = 'smoke-attachment.txt' AND status = 'uploaded';"
)"
if [ "$uploaded_count" != "1" ]; then
  fail "附件直传后数据库未记录 uploaded 状态"
fi

log "检查浏览器控制台错误"
errors="$(ab errors || true)"
if printf '%s\n' "$errors" | grep -Eiq 'error|exception|failed'; then
  printf '%s\n' "$errors" >&2
  fail "发现浏览器错误"
fi

best_effort_screenshot
log "通过；截图和服务日志保留在 ${ROOT}"
