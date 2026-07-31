use std::{collections::BTreeSet, fs, path::PathBuf};

use clap::Parser;
use serde_json::Value;
use yuance_agent::cli::Cli;

#[test]
fn supported_operations_and_request_bodies_exist() {
    let document = openapi();
    let operations = [
        ("/api/v1/projects", "get", None),
        ("/api/v1/projects/{project_key}", "get", None),
        ("/api/v1/work-items", "get", None),
        (
            "/api/v1/work-items",
            "post",
            Some("#/components/requestBodies/CreateWorkItem"),
        ),
        ("/api/v1/work-items/{item_key}", "get", None),
        (
            "/api/v1/work-items/{item_key}",
            "patch",
            Some("#/components/requestBodies/UpdateWorkItem"),
        ),
        (
            "/api/v1/work-items/{item_key}/handoff",
            "post",
            Some("#/components/requestBodies/HandoffWorkItem"),
        ),
        ("/api/v1/work-items/{item_key}/comments", "get", None),
        (
            "/api/v1/work-items/{item_key}/comments",
            "post",
            Some("#/components/requestBodies/CreateComment"),
        ),
    ];

    for (path, method, expected_body) in operations {
        let operation = &document["paths"][path][method];
        assert!(operation.is_object(), "missing {method} {path}");
        if let Some(expected_body) = expected_body {
            assert_eq!(operation["requestBody"]["$ref"], expected_body);
        }
    }

    let request_bodies = [
        ("CreateWorkItem", "CreateWorkItemRequest"),
        ("UpdateWorkItem", "UpdateWorkItemRequest"),
        ("HandoffWorkItem", "HandoffWorkItemRequest"),
        ("CreateComment", "CreateCommentRequest"),
    ];
    for (request_body, schema) in request_bodies {
        assert_eq!(
            document["components"]["requestBodies"][request_body]["content"]["application/json"]["schema"]
                ["$ref"],
            format!("#/components/schemas/{schema}")
        );
    }
}

#[test]
fn supported_request_fields_and_enums_match_cli_contract() {
    let document = openapi();
    let schemas = &document["components"]["schemas"];

    assert_eq!(
        string_set(&schemas["CreateWorkItemRequest"]["required"]),
        set(["item_type", "project_key", "title"])
    );
    assert_properties(
        &schemas["CreateWorkItemRequest"],
        &[
            "project_key",
            "item_type",
            "title",
            "description",
            "priority",
            "assignee_username",
            "due_date",
            "parent_item_key",
        ],
    );
    assert_properties(
        &schemas["UpdateWorkItemRequest"],
        &[
            "title",
            "description",
            "priority",
            "due_date",
            "parent_item_key",
        ],
    );
    assert_eq!(
        string_set(&schemas["HandoffWorkItemRequest"]["required"]),
        set(["status"])
    );
    assert_eq!(
        string_set(&schemas["CreateCommentRequest"]["required"]),
        set(["body"])
    );

    assert_eq!(
        string_set(&schemas["CreateWorkItemRequest"]["properties"]["item_type"]["enum"]),
        set(["bug", "requirement", "task"])
    );
    assert_eq!(
        string_set(
            &document["paths"]["/api/v1/work-items"]["get"]["parameters"][4]["schema"]["enum"]
        ),
        set(["P0", "P1", "P2", "P3"])
    );
    assert_eq!(
        string_set(&schemas["WorkItemStatus"]["enum"]),
        set([
            "cancelled",
            "closed",
            "done",
            "in_progress",
            "open",
            "pending_confirmation",
            "resolved",
            "verified",
        ])
    );
}

#[test]
fn update_cli_does_not_expose_flow_or_assignee_fields() {
    for forbidden in ["--status", "--assignee-username"] {
        let result = Cli::try_parse_from([
            "yuance-agent",
            "work-items",
            "update",
            "YCE-TASK-1",
            forbidden,
            "value",
        ]);
        assert!(result.is_err(), "update unexpectedly accepted {forbidden}");
    }
}

fn assert_properties(schema: &Value, expected: &[&str]) {
    for property in expected {
        assert!(
            schema["properties"].get(property).is_some(),
            "missing property {property}"
        );
    }
}

fn openapi() -> Value {
    let path =
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../docs/openapi/yuance.openapi.json");
    let source = fs::read_to_string(path).expect("OpenAPI document should be readable");
    serde_json::from_str(&source).expect("OpenAPI document should be valid JSON")
}

fn string_set(value: &Value) -> BTreeSet<String> {
    value
        .as_array()
        .expect("value should be an array")
        .iter()
        .map(|value| {
            value
                .as_str()
                .expect("value should be a string")
                .to_string()
        })
        .collect()
}

fn set<const N: usize>(values: [&str; N]) -> BTreeSet<String> {
    values.into_iter().map(str::to_string).collect()
}
