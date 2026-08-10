use axum::{
    body::Body,
    http::{Method, Request, StatusCode, header},
    response::Response,
};
use http_body_util::BodyExt;
use serde_json::{Value, json};
use tower::ServiceExt;
use yuance_api::web::router::{AppState, build_router};

const ENROLLMENT_PATH: &str = "/.well-known/yuance-desktop";

#[tokio::test]
async fn enrollment_get_and_head_publish_a_stable_strict_contract() {
    let app = build_router(test_state());

    let response = request(&app, Method::GET, ENROLLMENT_PATH, &[]).await;
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(
        response.headers().get(header::CONTENT_TYPE).unwrap(),
        "application/json; charset=utf-8"
    );
    assert_no_store(&response);
    let body = json_body(response).await;
    assert_eq!(
        body,
        json!({
            "schema_version": 1,
            "api_protocol_version": 1,
            "server_instance_id": "desktop-enrollment-test",
            "capabilities": [
                "device-authorization.v1",
                "device-session.probe.v1",
                "device-file-transfer.canary.v1"
            ]
        })
    );

    let response = request(&app, Method::HEAD, ENROLLMENT_PATH, &[]).await;
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(
        response.headers().get(header::CONTENT_TYPE).unwrap(),
        "application/json; charset=utf-8"
    );
    assert_no_store(&response);
    assert!(body_bytes(response).await.is_empty());
}

#[tokio::test]
async fn enrollment_identity_ignores_credentials_and_request_fields() {
    let app = build_router(test_state());
    let baseline = json_body(request(&app, Method::GET, ENROLLMENT_PATH, &[]).await).await;
    let response = request(
        &app,
        Method::GET,
        "/.well-known/yuance-desktop?server_instance_id=attacker&capabilities=all",
        &[
            (header::AUTHORIZATION.as_str(), "Bearer attacker"),
            (header::COOKIE.as_str(), "session=attacker"),
            ("x-forwarded-host", "attacker.invalid"),
            ("x-yuance-server-instance-id", "attacker"),
        ],
    )
    .await;

    assert_eq!(response.status(), StatusCode::OK);
    assert_no_store(&response);
    assert_eq!(json_body(response).await, baseline);
}

#[tokio::test]
async fn enrollment_rejects_wrong_methods_and_path_confusion() {
    let app = build_router(test_state());

    for method in [
        Method::POST,
        Method::PUT,
        Method::PATCH,
        Method::DELETE,
        Method::OPTIONS,
    ] {
        let response = request(&app, method, ENROLLMENT_PATH, &[]).await;
        assert_eq!(response.status(), StatusCode::METHOD_NOT_ALLOWED);
        let allow = response
            .headers()
            .get(header::ALLOW)
            .expect("method rejection should publish Allow")
            .to_str()
            .expect("Allow should be ASCII");
        assert_eq!(allow, "GET,HEAD");
    }

    for path in [
        "/.well-known/yuance-desktop/",
        "/.well-known/yuance-desktop.json",
        "/.well-known/yuance%2Ddesktop",
        "/.well-known/%79uance-desktop",
        "/api/.well-known/yuance-desktop",
    ] {
        let response = request(&app, Method::GET, path, &[]).await;
        assert_eq!(response.status(), StatusCode::NOT_FOUND, "path: {path}");
    }
}

#[test]
fn openapi_matches_enrollment_and_device_capabilities() {
    let document: Value =
        serde_json::from_str(include_str!("../../docs/openapi/yuance.openapi.json"))
            .expect("OpenAPI document should parse");
    let operation = &document["paths"][ENROLLMENT_PATH]["get"];
    let head_operation = &document["paths"][ENROLLMENT_PATH]["head"];

    assert_eq!(operation["security"], json!([]));
    assert_eq!(head_operation["security"], json!([]));
    assert_eq!(
        head_operation["responses"]["200"]["headers"]["Cache-Control"]["schema"]["const"],
        "no-store"
    );
    assert_eq!(
        operation["responses"]["200"]["content"]["application/json"]["schema"]["$ref"],
        "#/components/schemas/DesktopEnrollment"
    );
    assert_eq!(
        document["components"]["schemas"]["DesktopEnrollment"],
        json!({
            "type": "object",
            "additionalProperties": false,
            "required": [
                "schema_version",
                "api_protocol_version",
                "server_instance_id",
                "capabilities"
            ],
            "properties": {
                "schema_version": { "type": "integer", "const": 1 },
                "api_protocol_version": { "type": "integer", "const": 1 },
                "server_instance_id": { "type": "string", "minLength": 1 },
                "capabilities": {
                    "type": "array",
                    "prefixItems": [
                        { "const": "device-authorization.v1" },
                        { "const": "device-session.probe.v1" },
                        { "const": "device-file-transfer.canary.v1" }
                    ],
                    "minItems": 3,
                    "maxItems": 3
                }
            }
        })
    );
    assert_eq!(
        document["paths"]["/api/v1/device-session/events"]["get"]["security"],
        serde_json::json!([{ "deviceAccess": [] }])
    );
    for (path, method) in [
        ("/api/v1/device-file-transfer/canary/upload-request", "post"),
        (
            "/api/v1/device-file-transfer/canary/download-request",
            "get",
        ),
    ] {
        assert_eq!(
            document["paths"][path][method]["security"],
            serde_json::json!([{ "deviceAccess": [] }])
        );
        assert_eq!(
            document["paths"][path][method]["responses"]["200"]["content"]["application/json"]["schema"]
                ["$ref"],
            "#/components/schemas/DeviceFileTransferEnvelope"
        );
    }
    for (path, method) in [
        ("/api/v1/device-file-transfer/canary/upload", "put"),
        ("/api/v1/device-file-transfer/canary/download", "get"),
    ] {
        assert_eq!(document["paths"][path][method]["security"], json!([]));
        assert_eq!(
            document["paths"][path][method]["parameters"][0]["name"],
            "grant"
        );
    }
}

fn test_state() -> AppState {
    let mut state = AppState::for_tests();
    state.settings.device_sessions.server_instance_id = "desktop-enrollment-test".to_string();
    state
}

async fn request(
    app: &axum::Router,
    method: Method,
    uri: &str,
    headers: &[(&str, &str)],
) -> Response {
    let mut builder = Request::builder().method(method).uri(uri);
    for (name, value) in headers {
        builder = builder.header(*name, *value);
    }
    app.clone()
        .oneshot(builder.body(Body::empty()).expect("request should build"))
        .await
        .expect("router should respond")
}

fn assert_no_store(response: &Response) {
    assert_eq!(
        response.headers().get(header::CACHE_CONTROL).unwrap(),
        "no-store"
    );
}

async fn json_body(response: Response) -> Value {
    serde_json::from_slice(&body_bytes(response).await).expect("response should be JSON")
}

async fn body_bytes(response: Response) -> Vec<u8> {
    response
        .into_body()
        .collect()
        .await
        .expect("body should collect")
        .to_bytes()
        .to_vec()
}
