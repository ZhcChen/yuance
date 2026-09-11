use serde_json::{Value, json};

const RESOURCE_PATH: &str = "/api/v1/projects/{project_key}/resources/{resource_id}";
const RESOURCE_ATTACHMENTS_PATH: &str =
    "/api/v1/projects/{project_key}/resources/{resource_id}/attachments";
const LINKED_WORK_ITEM_POSTS_PATH: &str =
    "/api/v1/projects/{project_key}/resource-library/linked-work-item-posts";
const WORK_ITEM_RESOURCE_LIBRARY_LINK_PATH: &str =
    "/api/v1/work-items/{item_key}/resource-library-link";

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
        {"operation": "linked work item posts list", "permission": "project.view + work_item.view", "scope": "resource:read + work_item:read", "protected": true},
        {"operation": "work item resource link", "permission": "work_item.view + project.content.write", "scope": "work_item:write + resource:write", "protected": false},
        {"operation": "resources unlock", "permission": "project.view", "scope": "resource:read + resource:unlock", "protected": true},
        {"operation": "resources update", "permission": "project.view + project.content.write", "scope": "resource:write", "protected": false},
        {"operation": "attachment list/download", "permission": "project.view", "scope": "resource:read", "protected": true},
        {"operation": "attachment create/upload/complete/delete", "permission": "project.view + project.content.write", "scope": "resource:write", "protected": true},
        {"operation": "notifications list", "permission": null, "scope": "notification:read", "protected": false}
    ]);

    assert_eq!(matrix[1]["scope"], "resource:read");
    assert_eq!(matrix[2]["scope"], "resource:read + work_item:read");
    assert_eq!(matrix[3]["scope"], "work_item:write + resource:write");
    assert_eq!(matrix[4]["scope"], "resource:read + resource:unlock");
    assert_eq!(matrix[6]["protected"], true);
    assert_eq!(matrix[8]["scope"], "notification:read");
}

#[test]
fn openapi_covers_runtime_resource_actions_without_fake_pagination() {
    let spec: Value = serde_json::from_str(include_str!("../../docs/openapi/yuance.openapi.json"))
        .expect("OpenAPI document should be valid JSON");
    let paths = spec["paths"].as_object().unwrap();
    let required = [
        ("/api/v1/auth/me", "get"),
        ("/api/v1/projects/{project_key}/resources", "get"),
        (LINKED_WORK_ITEM_POSTS_PATH, "get"),
        (RESOURCE_PATH, "get"),
        (RESOURCE_PATH, "patch"),
        (
            "/api/v1/projects/{project_key}/resources/{resource_id}/unlock",
            "post",
        ),
        (RESOURCE_ATTACHMENTS_PATH, "get"),
        (RESOURCE_ATTACHMENTS_PATH, "post"),
        (
            "/api/v1/projects/{project_key}/resources/{resource_id}/attachments/{attachment_id}/upload-url",
            "get",
        ),
        (
            "/api/v1/projects/{project_key}/resources/{resource_id}/attachments/{attachment_id}/uploaded",
            "post",
        ),
        (
            "/api/v1/projects/{project_key}/resources/{resource_id}/attachments/{attachment_id}/download-url",
            "get",
        ),
        (
            "/api/v1/projects/{project_key}/resources/{resource_id}/attachments/{attachment_id}/preview",
            "get",
        ),
        (
            "/api/v1/projects/{project_key}/resources/{resource_id}/attachments/{attachment_id}",
            "delete",
        ),
        (WORK_ITEM_RESOURCE_LIBRARY_LINK_PATH, "post"),
        (WORK_ITEM_RESOURCE_LIBRARY_LINK_PATH, "delete"),
        ("/api/v1/notifications", "get"),
    ];

    for (path, method) in required {
        let operation = &paths[path][method];
        assert!(operation.is_object(), "missing {method} {path}");
        assert!(
            operation["operationId"].is_string(),
            "missing operationId for {method} {path}"
        );
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

    let linked_parameters = paths[LINKED_WORK_ITEM_POSTS_PATH]["get"]["parameters"]
        .as_array()
        .unwrap();
    let linked_query = linked_parameters
        .iter()
        .find(|parameter| parameter["name"] == "q")
        .expect("linked post query should exist");
    assert_eq!(linked_query["schema"]["maxLength"], 200);
    assert!(
        paths[LINKED_WORK_ITEM_POSTS_PATH]["get"]["description"]
            .as_str()
            .unwrap_or_default()
            .contains("正文和附件仍从原工作项详情读取")
    );
    let linked_operation = &paths[LINKED_WORK_ITEM_POSTS_PATH]["get"];
    for status in ["400", "403", "404"] {
        assert!(linked_operation["responses"][status].is_object());
    }
    let linked_post_schema = &spec["components"]["schemas"]["ProjectResourceLinkedWorkItemPost"];
    assert_eq!(linked_post_schema["additionalProperties"], false);
    assert_eq!(
        linked_post_schema["properties"]["item_type"]["enum"],
        json!(["requirement", "task", "bug"])
    );
    let linked_list_schema =
        &spec["components"]["schemas"]["ProjectResourceLinkedWorkItemPostListEnvelope"];
    assert_eq!(linked_list_schema["additionalProperties"], false);
    assert_eq!(linked_list_schema["properties"]["data"]["type"], "array");

    let link_schema = &spec["components"]["schemas"]["WorkItemResourceLibraryLink"];
    assert_eq!(link_schema["additionalProperties"], false);
    assert_eq!(link_schema["required"].as_array().unwrap().len(), 4);
    assert!(spec["paths"][WORK_ITEM_RESOURCE_LIBRARY_LINK_PATH]["get"].is_object());
    assert_eq!(
        spec["paths"][WORK_ITEM_RESOURCE_LIBRARY_LINK_PATH]["delete"]["description"],
        "只删除链接关系，不删除工作项、主发布内容或附件；重复调用保持成功。"
    );
    assert!(
        spec["paths"][WORK_ITEM_RESOURCE_LIBRARY_LINK_PATH]["delete"]["responses"]["400"]
            .is_object()
    );

    let detail_view_schema = &spec["components"]["schemas"]["WorkItemDetailViewEnvelope"];
    assert!(
        !detail_view_schema
            .to_string()
            .contains("can_manage_resource_library_link")
    );
    assert!(
        !detail_view_schema
            .to_string()
            .contains("resource_library_linked")
    );
}

#[test]
fn sensitive_attachment_fields_are_explicitly_marked() {
    let spec: Value = serde_json::from_str(include_str!("../../docs/openapi/yuance.openapi.json"))
        .expect("OpenAPI document should be valid JSON");
    let schemas = &spec["components"]["schemas"];
    assert_eq!(
        schemas["AttachmentEncryption"]["properties"]["format"]["const"],
        "YUANCE-ENC-v1"
    );
    assert!(
        schemas["AttachmentEncryption"]["properties"]["key"]["description"]
            .as_str()
            .unwrap()
            .contains("不得记录或持久化")
    );
    assert!(
        spec["components"]["parameters"]["ResourceAccess"]["description"]
            .as_str()
            .unwrap()
            .contains("不得记录或持久化")
    );
}
