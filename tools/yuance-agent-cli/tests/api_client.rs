use std::{
    net::SocketAddr,
    sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    },
    time::Duration,
};

use axum::{
    Json, Router,
    extract::Request,
    http::{HeaderMap, StatusCode},
    response::{Html, IntoResponse, Redirect},
    routing::get,
};
use serde_json::json;
use tokio::{net::TcpListener, time::sleep};
use yuance_agent::{
    client::{ApiClient, ClientConfig},
    error::AgentError,
};

#[tokio::test]
async fn preserves_success_envelope_and_sends_auth_headers() {
    let app = Router::new().route(
        "/api/v1/auth/me",
        get(|headers: HeaderMap, request: Request| async move {
            assert_eq!(
                headers
                    .get("authorization")
                    .and_then(|value| value.to_str().ok()),
                Some("Bearer yuance_pat_test")
            );
            assert_eq!(
                headers.get("accept").and_then(|value| value.to_str().ok()),
                Some("application/json")
            );
            assert!(
                headers
                    .get("user-agent")
                    .and_then(|value| value.to_str().ok())
                    .is_some_and(|value| value.starts_with("yuance-agent/"))
            );
            assert_eq!(request.uri().query(), Some("page=2"));
            Json(json!({"data": {"username": "alice"}}))
        }),
    );
    let base_url = spawn(app).await;
    let client = client(&base_url, Duration::from_secs(2));

    let payload = client
        .get("/api/v1/auth/me", &[("page", "2")])
        .await
        .expect("request should succeed");

    assert_eq!(payload, json!({"data": {"username": "alice"}}));
}

#[tokio::test]
async fn preserves_http_status_and_api_error_fields() {
    let app = Router::new()
        .route(
            "/unauthorized",
            get(api_error(StatusCode::UNAUTHORIZED, "unauthorized")),
        )
        .route(
            "/forbidden",
            get(api_error(StatusCode::FORBIDDEN, "forbidden")),
        )
        .route(
            "/missing",
            get(api_error(StatusCode::NOT_FOUND, "not_found")),
        )
        .route(
            "/invalid",
            get(api_error(
                StatusCode::UNPROCESSABLE_ENTITY,
                "validation_failed",
            )),
        );
    let base_url = spawn(app).await;
    let client = client(&base_url, Duration::from_secs(2));

    for (path, status, code, exit_code) in [
        ("/unauthorized", 401, "unauthorized", 10),
        ("/forbidden", 403, "forbidden", 11),
        ("/missing", 404, "not_found", 12),
        ("/invalid", 422, "validation_failed", 13),
    ] {
        let error = client
            .get(path, &[])
            .await
            .expect_err("request should fail");
        match &error {
            AgentError::Http {
                status: actual_status,
                code: actual_code,
                message,
            } => {
                assert_eq!(*actual_status, status);
                assert_eq!(actual_code, code);
                assert_eq!(message, "request rejected");
            }
            other => panic!("expected HTTP error, got {other:?}"),
        }
        assert_eq!(error.exit_code(), exit_code);
    }
}

#[tokio::test]
async fn classifies_timeout_disconnect_and_invalid_json() {
    let app = Router::new()
        .route(
            "/slow",
            get(|| async {
                sleep(Duration::from_millis(100)).await;
                Json(json!({"data": {}}))
            }),
        )
        .route("/invalid-json", get(|| async { "not json" }))
        .route(
            "/html-error",
            get(|| async { (StatusCode::BAD_GATEWAY, Html("<h1>upstream secret</h1>")) }),
        );
    let base_url = spawn(app).await;

    let timeout = client(&base_url, Duration::from_millis(20))
        .get("/slow", &[])
        .await
        .expect_err("request should time out");
    assert!(matches!(timeout, AgentError::Timeout));

    let regular = client(&base_url, Duration::from_secs(2));
    let invalid_json = regular
        .get("/invalid-json", &[])
        .await
        .expect_err("response should be rejected");
    assert!(matches!(
        invalid_json,
        AgentError::Response {
            code: "invalid_json",
            ..
        }
    ));

    let html_error = regular
        .get("/html-error", &[])
        .await
        .expect_err("response should be rejected");
    match html_error {
        AgentError::Http { code, message, .. } => {
            assert_eq!(code, "http_error");
            assert_eq!(message, "Bad Gateway");
            assert!(!message.contains("secret"));
        }
        other => panic!("expected HTTP error, got {other:?}"),
    }

    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .expect("port should bind");
    let disconnected_url = format!("http://{}", listener.local_addr().unwrap());
    drop(listener);
    let disconnected = client(&disconnected_url, Duration::from_millis(200))
        .get("/", &[])
        .await
        .expect_err("request should fail to connect");
    assert!(matches!(disconnected, AgentError::Connect));
}

#[tokio::test]
async fn rejects_redirects_and_oversized_responses() {
    let target_requests = Arc::new(AtomicUsize::new(0));
    let target_counter = Arc::clone(&target_requests);
    let target = Router::new().route(
        "/target",
        get(move || {
            let target_counter = Arc::clone(&target_counter);
            async move {
                target_counter.fetch_add(1, Ordering::SeqCst);
                Json(json!({"data": {}}))
            }
        }),
    );
    let target_url = spawn(target).await;
    let redirect_url = format!("{target_url}/target");
    let app = Router::new()
        .route(
            "/redirect",
            get(move || {
                let redirect_url = redirect_url.clone();
                async move { Redirect::temporary(&redirect_url) }
            }),
        )
        .route(
            "/oversized",
            get(|| async { vec![b'x'; 8 * 1024 * 1024 + 1] }),
        );
    let base_url = spawn(app).await;
    let client = client(&base_url, Duration::from_secs(2));

    let redirect = client
        .get("/redirect", &[])
        .await
        .expect_err("redirect should not be followed");
    assert!(matches!(redirect, AgentError::Http { status: 307, .. }));
    assert_eq!(target_requests.load(Ordering::SeqCst), 0);

    let oversized = client
        .get("/oversized", &[])
        .await
        .expect_err("oversized response should fail");
    assert!(matches!(
        oversized,
        AgentError::Response {
            code: "response_too_large",
            ..
        }
    ));
}

#[test]
fn rejects_missing_token_and_invalid_base_url_before_building_client() {
    let missing = ClientConfig::new("https://example.test", " ", Duration::from_secs(1))
        .expect_err("missing token should fail");
    assert!(matches!(
        missing,
        AgentError::Config {
            code: "missing_api_token",
            ..
        }
    ));

    let invalid = ClientConfig::new("file:///tmp/yuance", "token", Duration::from_secs(1))
        .expect_err("invalid URL should fail");
    assert!(matches!(
        invalid,
        AgentError::Config {
            code: "invalid_base_url",
            ..
        }
    ));
}

#[test]
fn client_config_debug_output_redacts_token() {
    let config = ClientConfig::new(
        "https://example.test",
        "yuance_pat_sensitive",
        Duration::from_secs(1),
    )
    .expect("config should be valid");

    let debug = format!("{config:?}");
    assert!(debug.contains("[REDACTED]"));
    assert!(!debug.contains("yuance_pat_sensitive"));
}

fn api_error(
    status: StatusCode,
    code: &'static str,
) -> impl Clone + Fn() -> std::future::Ready<axum::response::Response> {
    move || {
        std::future::ready(
            (
                status,
                Json(json!({"error": {"code": code, "message": "request rejected"}})),
            )
                .into_response(),
        )
    }
}

fn client(base_url: &str, timeout: Duration) -> ApiClient {
    let config = ClientConfig::new(base_url, "yuance_pat_test", timeout)
        .expect("client config should be valid");
    ApiClient::from_config(config).expect("client should build")
}

async fn spawn(app: Router) -> String {
    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .expect("server should bind");
    let address: SocketAddr = listener.local_addr().expect("address should resolve");
    tokio::spawn(async move {
        axum::serve(listener, app).await.expect("server should run");
    });
    format!("http://{address}")
}
