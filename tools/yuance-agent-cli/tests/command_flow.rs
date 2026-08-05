use std::{
    collections::HashMap,
    fs,
    io::Write,
    process::{Command, Output, Stdio},
    sync::{Arc, Mutex},
};

use axum::{
    Router,
    body::Bytes,
    extract::{OriginalUri, State},
    http::{HeaderMap, Method},
    response::IntoResponse,
    routing::any,
};
use serde_json::{Value, json};

#[derive(Clone, Debug)]
struct CapturedRequest {
    method: Method,
    uri: String,
    headers: HeaderMap,
    body: Value,
}

type Requests = Arc<Mutex<Vec<CapturedRequest>>>;

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn project_commands_encode_queries_and_path_segments() {
    let (base_url, requests) = server().await;

    run(&base_url, &["projects", "list"]);
    run(
        &base_url,
        &[
            "projects",
            "list",
            "--status",
            "active now",
            "--page",
            "2",
            "--per-page",
            "40",
        ],
    );
    run(&base_url, &["projects", "get", "YCE/研发 ?"]);

    let requests = requests.lock().unwrap();
    assert_request(&requests[0], Method::GET, "/api/v1/projects");
    assert_eq!(requests[0].uri, "/api/v1/projects");
    assert_eq!(
        query(&requests[1].uri),
        HashMap::from([
            ("status".to_string(), "active now".to_string()),
            ("page".to_string(), "2".to_string()),
            ("per_page".to_string(), "40".to_string()),
        ])
    );
    assert_eq!(
        requests[2].uri,
        "/api/v1/projects/YCE%2F%E7%A0%94%E5%8F%91%20%3F"
    );
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn work_item_list_and_get_preserve_explicit_filters_and_keys() {
    let (base_url, requests) = server().await;
    run(&base_url, &["work-items", "list"]);
    run(
        &base_url,
        &[
            "work-items",
            "list",
            "--item-type",
            "bug",
            "--project-key",
            "YCE A",
            "--q",
            "登录 & 权限",
            "--status",
            "in_progress",
            "--priority",
            "P1",
            "--assignee-username",
            "alice+bob",
        ],
    );
    run(&base_url, &["work-items", "get", "YCE/BUG?#1"]);

    let requests = requests.lock().unwrap();
    assert_eq!(requests[0].uri, "/api/v1/work-items");
    let query = query(&requests[1].uri);
    assert_eq!(query["item_type"], "bug");
    assert_eq!(query["project_key"], "YCE A");
    assert_eq!(query["q"], "登录 & 权限");
    assert_eq!(query["status"], "in_progress");
    assert_eq!(query["priority"], "P1");
    assert_eq!(query["assignee_username"], "alice+bob");
    assert_eq!(requests[2].uri, "/api/v1/work-items/YCE%2FBUG%3F%231");
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn create_supports_all_item_types_and_explicit_payloads() {
    let (base_url, requests) = server().await;
    for item_type in ["requirement", "task", "bug"] {
        run(
            &base_url,
            &[
                "work-items",
                "create",
                "--project-key",
                "YCE",
                "--item-type",
                item_type,
                "--title",
                "契约测试",
                "--description",
                "正文",
                "--priority",
                "P2",
                "--assignee-username",
                "alice",
                "--due-date",
                "2026-08-01",
                "--parent-item-key",
                "YCE-REQ-1",
            ],
        );
    }

    let requests = requests.lock().unwrap();
    for (request, item_type) in requests.iter().zip(["requirement", "task", "bug"]) {
        assert_request(request, Method::POST, "/api/v1/work-items");
        assert_json_content_type(request);
        assert_eq!(request.body["item_type"], item_type);
        assert_eq!(request.body["project_key"], "YCE");
        assert_eq!(request.body["title"], "契约测试");
        assert_eq!(request.body["priority"], "P2");
        assert_eq!(request.body["assignee_username"], "alice");
    }
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn update_only_sends_explicit_metadata_and_handoff_owns_flow_fields() {
    let (base_url, requests) = server().await;
    run(
        &base_url,
        &[
            "work-items",
            "update",
            "YCE-TASK-1",
            "--title",
            "新标题",
            "--priority",
            "P0",
        ],
    );
    run(
        &base_url,
        &[
            "work-items",
            "handoff",
            "YCE-TASK-1",
            "--status",
            "in_progress",
            "--assignee-username",
            "bob",
            "--body",
            "开始处理",
            "--source-comment-id",
            "123",
        ],
    );

    let requests = requests.lock().unwrap();
    assert_request(&requests[0], Method::PATCH, "/api/v1/work-items/YCE-TASK-1");
    assert_eq!(
        requests[0].body,
        json!({"title": "新标题", "priority": "P0"})
    );
    assert!(requests[0].body.get("status").is_none());
    assert!(requests[0].body.get("assignee_username").is_none());
    assert_json_content_type(&requests[0]);

    assert_request(
        &requests[1],
        Method::POST,
        "/api/v1/work-items/YCE-TASK-1/handoff",
    );
    assert_eq!(
        requests[1].body,
        json!({
            "status": "in_progress",
            "assignee_username": "bob",
            "body": "开始处理",
            "source_comment_id": 123
        })
    );
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn comments_distinguish_top_level_and_reply() {
    let (base_url, requests) = server().await;
    run(&base_url, &["comments", "list", "YCE-BUG-2"]);
    run(
        &base_url,
        &["comments", "create", "YCE-BUG-2", "--body", "顶层评论"],
    );
    run(
        &base_url,
        &[
            "comments",
            "create",
            "YCE-BUG-2",
            "--body",
            "回复",
            "--body-format",
            "plain",
            "--parent-comment-id",
            "42",
        ],
    );

    let requests = requests.lock().unwrap();
    assert_request(
        &requests[0],
        Method::GET,
        "/api/v1/work-items/YCE-BUG-2/comments",
    );
    assert_eq!(
        requests[1].body,
        json!({"body": "顶层评论", "body_format": "html"})
    );
    assert_eq!(
        requests[2].body,
        json!({"body": "回复", "body_format": "plain", "parent_comment_id": 42})
    );
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn long_body_reads_file_and_stdin() {
    let (base_url, requests) = server().await;
    let path = std::env::temp_dir().join(format!(
        "yuance-agent-description-{}-{}.txt",
        std::process::id(),
        Arc::as_ptr(&requests) as usize
    ));
    fs::write(&path, "文件描述\n第二行").unwrap();
    run(
        &base_url,
        &[
            "work-items",
            "create",
            "--project-key",
            "YCE",
            "--item-type",
            "task",
            "--title",
            "文件输入",
            "--description-file",
            path.to_str().unwrap(),
        ],
    );
    run_with_stdin(
        &base_url,
        &["comments", "create", "YCE-TASK-1", "--body-file", "-"],
        "stdin 评论\n第二行",
    );
    fs::remove_file(path).unwrap();

    let requests = requests.lock().unwrap();
    assert_eq!(requests[0].body["description"], "文件描述\n第二行");
    assert_eq!(requests[1].body["body"], "stdin 评论\n第二行");
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn invalid_local_input_does_not_send_requests() {
    let (base_url, requests) = server().await;
    let output = command_output(&base_url, &["work-items", "update", "YCE-TASK-1"], None);
    assert_eq!(output.status.code(), Some(2));
    assert_eq!(
        json_stderr(&output)["error"]["code"],
        "missing_update_fields"
    );

    let output = command_output(
        &base_url,
        &["comments", "create", "YCE-TASK-1", "--body", "  "],
        None,
    );
    assert_eq!(output.status.code(), Some(2));
    assert_eq!(json_stderr(&output)["error"]["code"], "empty_input");

    let output = command_output(&base_url, &["work-items", "list", "--page", "0"], None);
    assert_eq!(output.status.code(), Some(2));
    assert!(requests.lock().unwrap().is_empty());
}

fn run(base_url: &str, args: &[&str]) {
    let output = command_output(base_url, args, None);
    assert!(
        output.status.success(),
        "command failed: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    assert_eq!(
        serde_json::from_slice::<Value>(&output.stdout).unwrap(),
        json!({"data": {"ok": true}})
    );
}

fn run_with_stdin(base_url: &str, args: &[&str], stdin: &str) {
    let output = command_output(base_url, args, Some(stdin));
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
}

fn command_output(base_url: &str, args: &[&str], stdin: Option<&str>) -> Output {
    let mut command = Command::new(env!("CARGO_BIN_EXE_yuance-agent"));
    command
        .args(args)
        .env("YUANCE_BASE_URL", base_url)
        .env("YUANCE_API_TOKEN", "yuance_pat_test")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    if stdin.is_some() {
        command.stdin(Stdio::piped());
    }
    let mut child = command.spawn().unwrap();
    if let Some(stdin) = stdin {
        child
            .stdin
            .take()
            .unwrap()
            .write_all(stdin.as_bytes())
            .unwrap();
    }
    child.wait_with_output().unwrap()
}

async fn server() -> (String, Requests) {
    let requests = Requests::default();
    let app = Router::new()
        .fallback(any(capture))
        .with_state(requests.clone());
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    (format!("http://{address}"), requests)
}

async fn capture(
    State(requests): State<Requests>,
    method: Method,
    OriginalUri(uri): OriginalUri,
    headers: HeaderMap,
    body: Bytes,
) -> impl IntoResponse {
    let body = if body.is_empty() {
        Value::Null
    } else {
        serde_json::from_slice(&body).unwrap()
    };
    requests.lock().unwrap().push(CapturedRequest {
        method,
        uri: uri.to_string(),
        headers,
        body,
    });
    axum::Json(json!({"data": {"ok": true}}))
}

fn assert_request(request: &CapturedRequest, method: Method, path: &str) {
    assert_eq!(request.method, method);
    assert_eq!(request.uri.split('?').next().unwrap(), path);
}

fn assert_json_content_type(request: &CapturedRequest) {
    assert_eq!(
        request.headers.get("content-type").unwrap(),
        "application/json"
    );
}

fn query(uri: &str) -> HashMap<String, String> {
    let url = reqwest::Url::parse(&format!("http://localhost{uri}")).unwrap();
    url.query_pairs().into_owned().collect()
}

fn json_stderr(output: &Output) -> Value {
    serde_json::from_slice(&output.stderr).unwrap()
}
