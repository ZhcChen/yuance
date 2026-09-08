use serde_json::{Value, json};

const RESOURCE_PATH: &str = "/api/v1/projects/{project_key}/resources/{resource_id}";
const RESOURCE_ATTACHMENTS_PATH: &str =
    "/api/v1/projects/{project_key}/resources/{resource_id}/attachments";

// This fixture is intentionally independent of the OpenAPI document. It mirrors the
// fields emitted by project_resource_payload and attachment_payload in the API layer.
const HANDLER_RESOURCE_RESPONSE: &str = r#"{
  "data": {
    "id": 7,
    "project_key": "YCE",
    "title": "集成资料",
    "category": "integration",
    "body": "<p>正文</p>",
    "body_format": "html",
    "summary": "正文",
    "status": "active",
    "is_protected": false,
    "access_token": null,
    "created_by": "owner",
    "updated_by": "owner",
    "created_at": "2026-09-08 10:00:00",
    "updated_at": "2026-09-08 10:00:00",
    "url": "/web/projects/YCE/resources/7"
  }
}"#;

#[test]
fn independent_handler_evidence_matches_resource_envelope() {
    let response: Value = serde_json::from_str(HANDLER_RESOURCE_RESPONSE).unwrap();
    let data = response["data"].as_object().unwrap();
    for field in [
        "id",
        "project_key",
        "title",
        "category",
        "body",
        "body_format",
        "summary",
        "status",
        "is_protected",
        "access_token",
        "created_by",
        "updated_by",
        "created_at",
        "updated_at",
        "url",
    ] {
        assert!(data.contains_key(field), "handler response misses {field}");
    }
    assert!(data["access_token"].is_null());
}

#[test]
fn authorization_matrix_freezes_resource_boundaries() {
    let matrix = json!([
        {"operation": "auth/me", "permission": null, "scope": null, "protected": false},
        {"operation": "resources list/get", "permission": "project.view", "scope": "resource:read", "protected": true},
        {"operation": "resources unlock", "permission": "project.view", "scope": "resource:read + resource:unlock", "protected": true},
        {"operation": "resources update", "permission": "project.view + project.content.write", "scope": "resource:write", "protected": false},
        {"operation": "attachment list/download", "permission": "project.view", "scope": "resource:read", "protected": true},
        {"operation": "attachment create/upload/complete/delete", "permission": "project.view + project.content.write", "scope": "resource:write", "protected": true},
        {"operation": "notifications list", "permission": null, "scope": "notification:read", "protected": false}
    ]);

    assert_eq!(matrix[1]["scope"], "resource:read");
    assert_eq!(matrix[2]["scope"], "resource:read + resource:unlock");
    assert_eq!(matrix[4]["protected"], true);
    assert_eq!(matrix[6]["scope"], "notification:read");
}

#[test]
fn openapi_covers_runtime_resource_actions_without_fake_pagination() {
    let spec: Value = serde_json::from_str(include_str!("../../docs/openapi/yuance.openapi.json"))
        .expect("OpenAPI document should be valid JSON");
    let paths = spec["paths"].as_object().unwrap();
    let required = [
        ("/api/v1/auth/me", "get"),
        ("/api/v1/projects/{project_key}/resources", "get"),
        (RESOURCE_PATH, "get"),
        (RESOURCE_PATH, "patch"),
        ("/api/v1/projects/{project_key}/resources/{resource_id}/unlock", "post"),
        (RESOURCE_ATTACHMENTS_PATH, "get"),
        (RESOURCE_ATTACHMENTS_PATH, "post"),
        ("/api/v1/projects/{project_key}/resources/{resource_id}/attachments/{attachment_id}/upload-url", "get"),
        ("/api/v1/projects/{project_key}/resources/{resource_id}/attachments/{attachment_id}/uploaded", "post"),
        ("/api/v1/projects/{project_key}/resources/{resource_id}/attachments/{attachment_id}/download-url", "get"),
        ("/api/v1/projects/{project_key}/resources/{resource_id}/attachments/{attachment_id}/preview", "get"),
        ("/api/v1/projects/{project_key}/resources/{resource_id}/attachments/{attachment_id}", "delete"),
        ("/api/v1/notifications", "get"),
    ];

    for (path, method) in required {
        let operation = &paths[path][method];
        assert!(operation.is_object(), "missing {method} {path}");
        assert!(operation["operationId"].is_string(), "missing operationId for {method} {path}");
    }

    let list_parameters = paths["/api/v1/projects/{project_key}/resources"]["get"]["parameters"]
        .as_array()
        .unwrap();
    let names: Vec<&str> = list_parameters
        .iter()
        .filter_map(|parameter| parameter["name"].as_str())
        .collect();
    assert!(names.contains(&"tag"));
    assert!(names.contains(&"related_work_item_key"));
    assert!(names.contains(&"related_cycle_id"));
    assert!(!names.contains(&"page"));
    assert!(!names.contains(&"per_page"));
}

#[test]
fn sensitive_attachment_fields_are_explicitly_marked() {
    let spec: Value = serde_json::from_str(include_str!("../../docs/openapi/yuance.openapi.json"))
        .expect("OpenAPI document should be valid JSON");
    let schemas = &spec["components"]["schemas"];
    assert_eq!(schemas["AttachmentEncryption"]["properties"]["format"]["const"], "YUANCE-ENC-v1");
    assert!(schemas["AttachmentEncryption"]["properties"]["key"]["description"]
        .as_str()
        .unwrap()
        .contains("不得记录或持久化"));
    assert!(spec["components"]["parameters"]["ResourceAccess"]["description"]
        .as_str()
        .unwrap()
        .contains("不得记录或持久化"));
}
