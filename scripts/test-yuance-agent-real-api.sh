#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/yuance-agent-real-api.XXXXXX")"
PORT="${YUANCE_AGENT_E2E_PORT:-$((34000 + $$ % 10000))}"
BASE_URL="http://127.0.0.1:${PORT}"
COOKIE_JAR="$TEMP_DIR/cookies.txt"
API_LOG="$TEMP_DIR/api.log"
API_PID=""

fail() {
  printf '真实 API CLI 验收失败：%s\n' "$1" >&2
  if [[ -f "$API_LOG" ]]; then
    tail -50 "$API_LOG" >&2
  fi
  exit 1
}

cleanup() {
  if [[ -n "$API_PID" ]] && kill -0 "$API_PID" 2>/dev/null; then
    kill "$API_PID" 2>/dev/null || true
    wait "$API_PID" 2>/dev/null || true
  fi
  rm -rf "$TEMP_DIR"
}
trap cleanup EXIT
trap 'exit 130' HUP INT TERM

for command_name in cargo curl jq; do
  command -v "$command_name" >/dev/null 2>&1 || fail "缺少命令：$command_name"
done

cd "$ROOT_DIR"
cargo build -p yuance-api -p yuance-agent >/dev/null

export YUANCE_ENV=test
export YUANCE_DATABASE_URL="sqlite://$TEMP_DIR/yuance.sqlite3"
export YUANCE_DATA_DIR="$TEMP_DIR/data"
export YUANCE_SESSION_SECRET="agent-e2e-session-secret"
export YUANCE_SECURITY_MASTER_KEY="agent-e2e-master-key-that-is-long-enough"
export YUANCE_LOG_LEVEL=off

target/debug/yuance-api migrate up >/dev/null
target/debug/yuance-api serve --http-addr "127.0.0.1:$PORT" >"$API_LOG" 2>&1 &
API_PID=$!

for _ in {1..50}; do
  if curl -fsS "$BASE_URL/api/healthz" >/dev/null 2>&1; then
    break
  fi
  kill -0 "$API_PID" 2>/dev/null || fail "API 服务启动失败"
  sleep 0.1
done
curl -fsS "$BASE_URL/api/healthz" >/dev/null || fail "API 服务未就绪"

bootstrap_response="$TEMP_DIR/bootstrap.json"
curl -fsS \
  --cookie-jar "$COOKIE_JAR" \
  -H 'Content-Type: application/json' \
  -d '{"username":"agent-admin","display_name":"Agent 验收","password":"AgentTestPass2026!","password_confirm":"AgentTestPass2026!"}' \
  "$BASE_URL/api/v1/bootstrap/init" >"$bootstrap_response"
csrf_token="$(jq -er '.data.csrf_token' "$bootstrap_response")"

api_post() {
  local path="$1"
  local body="$2"
  local output="$3"
  curl -fsS \
    --cookie "$COOKIE_JAR" \
    --cookie-jar "$COOKIE_JAR" \
    -H 'Content-Type: application/json' \
    -H "x-yuance-csrf-token: $csrf_token" \
    -d "$body" \
    "$BASE_URL$path" >"$output"
}

project_response="$TEMP_DIR/project.json"
api_post "/api/v1/projects" \
  '{"name":"Agent CLI 验收项目","description":"真实二进制与受限 PAT 验收","status":"in_progress"}' \
  "$project_response"
project_key="$(jq -er '.data.key' "$project_response")"

outside_project_response="$TEMP_DIR/outside-project.json"
api_post "/api/v1/projects" \
  '{"name":"Agent CLI 范围外项目","description":"验证 PAT 项目范围","status":"in_progress"}' \
  "$outside_project_response"
outside_project_key="$(jq -er '.data.key' "$outside_project_response")"

create_token() {
  local name="$1"
  local scopes="$2"
  local output="$3"
  api_post "/api/v1/me/tokens" \
    "{\"name\":\"$name\",\"scopes\":$scopes,\"project_scope\":\"$project_key\"}" \
    "$output"
}

full_token_response="$TEMP_DIR/full-token.json"
read_token_response="$TEMP_DIR/read-token.json"
deleted_token_response="$TEMP_DIR/deleted-token.json"
create_token "CLI 完整验收" \
  '["project:read","work_item:read","work_item:write","comment:write"]' \
  "$full_token_response"
create_token "CLI 只读验收" \
  '["project:read","work_item:read"]' \
  "$read_token_response"
create_token "CLI 删除验收" \
  '["project:read"]' \
  "$deleted_token_response"

full_token="$(jq -er '.data.raw_token' "$full_token_response")"
read_token="$(jq -er '.data.raw_token' "$read_token_response")"
deleted_token="$(jq -er '.data.raw_token' "$deleted_token_response")"
deleted_token_id="$(jq -er '.data.token.id' "$deleted_token_response")"

run_cli() {
  local token="$1"
  shift
  YUANCE_BASE_URL="$BASE_URL" YUANCE_API_TOKEN="$token" \
    target/debug/yuance-agent "$@"
}

projects_output="$TEMP_DIR/projects.json"
run_cli "$full_token" projects list --per-page 5 >"$projects_output"
jq -e --arg key "$project_key" \
  '.data.items | length == 1 and .[0].key == $key' \
  "$projects_output" >/dev/null || fail "PAT 项目列表范围不正确"

set +e
run_cli "$full_token" work-items create \
  --project-key "$outside_project_key" \
  --item-type task \
  --title "不应跨项目创建" \
  >"$TEMP_DIR/out-of-scope.stdout" 2>"$TEMP_DIR/out-of-scope.stderr"
out_of_scope_status=$?
set -e
[[ "$out_of_scope_status" == 11 ]] || fail "跨项目写入退出码应为 11"
jq -e '.error.status == 403' "$TEMP_DIR/out-of-scope.stderr" >/dev/null || \
  fail "跨项目写入未返回结构化 403"

created_output="$TEMP_DIR/created.json"
run_cli "$full_token" work-items create \
  --project-key "$project_key" \
  --item-type bug \
  --title "CLI 真实读写验收" \
  --description "由受限测试 PAT 创建" \
  --priority P1 >"$created_output"
item_key="$(jq -er '.data.key' "$created_output")"

run_cli "$full_token" work-items get "$item_key" >"$TEMP_DIR/detail.json"
jq -e '.data.title == "CLI 真实读写验收"' "$TEMP_DIR/detail.json" >/dev/null || \
  fail "工作项详情读取失败"

run_cli "$full_token" comments create "$item_key" \
  --body '<p>顶层评论</p>' >"$TEMP_DIR/comment.json"
comment_id="$(jq -er '.data.id' "$TEMP_DIR/comment.json")"
run_cli "$full_token" comments create "$item_key" \
  --body '<p>回复评论</p>' \
  --parent-comment-id "$comment_id" >"$TEMP_DIR/reply.json"

run_cli "$full_token" work-items update "$item_key" \
  --title "CLI 真实读写验收已更新" >"$TEMP_DIR/updated.json"
jq -e '.data.title == "CLI 真实读写验收已更新"' "$TEMP_DIR/updated.json" >/dev/null || \
  fail "工作项更新失败"

run_cli "$full_token" work-items handoff "$item_key" \
  --status in_progress \
  --body "开始处理验收工作项" >"$TEMP_DIR/handoff.json"
jq -e '.data.status == "in_progress"' "$TEMP_DIR/handoff.json" >/dev/null || \
  fail "工作项 handoff 失败"

run_cli "$full_token" comments list "$item_key" >"$TEMP_DIR/comments.json"
jq -e --argjson parent_id "$comment_id" \
  '.data | any(.parent_comment_id == $parent_id)' \
  "$TEMP_DIR/comments.json" >/dev/null || fail "评论回复未出现在评论上下文"

set +e
run_cli "$read_token" work-items create \
  --project-key "$project_key" \
  --item-type task \
  --title "不应以只读 Token 创建" \
  >"$TEMP_DIR/forbidden.stdout" 2>"$TEMP_DIR/forbidden.stderr"
forbidden_status=$?
set -e
[[ "$forbidden_status" == 11 ]] || fail "只读 Token 写入退出码应为 11"
jq -e '.error.status == 403' "$TEMP_DIR/forbidden.stderr" >/dev/null || \
  fail "只读 Token 写入未返回结构化 403"

curl -fsS \
  -X DELETE \
  --cookie "$COOKIE_JAR" \
  -H "x-yuance-csrf-token: $csrf_token" \
  "$BASE_URL/api/v1/me/tokens/$deleted_token_id" >"$TEMP_DIR/deleted-token-result.json"

set +e
run_cli "$deleted_token" projects list \
  >"$TEMP_DIR/unauthorized.stdout" 2>"$TEMP_DIR/unauthorized.stderr"
unauthorized_status=$?
set -e
[[ "$unauthorized_status" == 10 ]] || fail "已删除 Token 查询退出码应为 10"
jq -e '.error.status == 401' "$TEMP_DIR/unauthorized.stderr" >/dev/null || \
  fail "已删除 Token 未返回结构化 401"

printf '真实 API CLI 验收通过：项目范围、查询、创建、详情、评论、回复、更新、handoff、403、401。\n'
