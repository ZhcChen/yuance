use std::process::Command;

use clap::{CommandFactory, Parser};
use serde_json::Value;
use yuance_agent::cli::Cli;

#[test]
fn clap_command_definition_is_valid() {
    Cli::command().debug_assert();
    Cli::try_parse_from(["yuance-agent", "doctor", "--installation"])
        .expect("doctor command should parse");
    Cli::try_parse_from(["yuance-agent", "--pretty", "doctor", "--installation"])
        .expect("global pretty option should parse");
}

#[test]
fn help_and_version_are_human_readable() {
    let binary = env!("CARGO_BIN_EXE_yuance-agent");

    let help = Command::new(binary)
        .arg("--help")
        .output()
        .expect("help command should run");
    assert!(help.status.success());
    let help = String::from_utf8(help.stdout).expect("help should be utf-8");
    assert!(help.contains("Usage:"));
    assert!(help.contains("doctor"));

    let version = Command::new(binary)
        .arg("--version")
        .output()
        .expect("version command should run");
    assert!(version.status.success());
    assert_eq!(
        String::from_utf8(version.stdout).unwrap().trim(),
        concat!("yuance-agent ", env!("CARGO_PKG_VERSION"))
    );
}

#[test]
fn installation_doctor_outputs_json_without_credentials() {
    let output = Command::new(env!("CARGO_BIN_EXE_yuance-agent"))
        .args(["doctor", "--installation"])
        .env_remove("YUANCE_API_TOKEN")
        .output()
        .expect("doctor command should run");

    assert!(output.status.success());
    assert!(output.stderr.is_empty());
    let payload: Value = serde_json::from_slice(&output.stdout).expect("stdout should be JSON");
    assert_eq!(payload["data"]["status"], "installed");
    assert_eq!(payload["data"]["version"], env!("CARGO_PKG_VERSION"));
    assert!(payload["data"]["target"].is_string());
}

#[test]
fn missing_token_outputs_structured_error_without_network_request() {
    let output = Command::new(env!("CARGO_BIN_EXE_yuance-agent"))
        .arg("doctor")
        .env_remove("YUANCE_API_TOKEN")
        .env("YUANCE_BASE_URL", "http://127.0.0.1:1")
        .output()
        .expect("doctor command should run");

    assert_eq!(output.status.code(), Some(2));
    assert!(output.stdout.is_empty());
    let payload: Value = serde_json::from_slice(&output.stderr).expect("stderr should be JSON");
    assert_eq!(payload["error"]["kind"], "config");
    assert_eq!(payload["error"]["code"], "missing_api_token");
    assert!(!String::from_utf8_lossy(&output.stderr).contains("yuance_pat_"));
}

#[test]
fn resource_and_notification_commands_have_explicit_boundaries() {
    for args in [
        ["yuance-agent", "whoami"].as_slice(),
        ["yuance-agent", "resources", "list", "--project-key", "YCE"].as_slice(),
        [
            "yuance-agent",
            "resources",
            "get",
            "--project-key",
            "YCE",
            "--resource-id",
            "7",
        ]
        .as_slice(),
        [
            "yuance-agent",
            "resources",
            "create",
            "--project-key",
            "YCE",
            "--title",
            "资料",
        ]
        .as_slice(),
        [
            "yuance-agent",
            "resources",
            "unlock",
            "--project-key",
            "YCE",
            "--resource-id",
            "7",
        ]
        .as_slice(),
        [
            "yuance-agent",
            "notifications",
            "list",
            "--page",
            "2",
            "--per-page",
            "20",
        ]
        .as_slice(),
    ] {
        assert!(
            Cli::try_parse_from(args).is_ok(),
            "command should parse: {args:?}"
        );
    }

    assert!(
        Cli::try_parse_from([
            "yuance-agent",
            "resources",
            "list",
            "--project-key",
            "YCE",
            "--page",
            "1"
        ])
        .is_err()
    );
    assert!(
        Cli::try_parse_from([
            "yuance-agent",
            "resources",
            "attachments",
            "upload",
            "--project-key",
            "YCE"
        ])
        .is_err()
    );
    assert!(
        Cli::try_parse_from([
            "yuance-agent",
            "resources",
            "update",
            "--project-key",
            "YCE",
            "--resource-id",
            "7",
            "--body-file",
            "-",
            "--access-password-stdin",
        ])
        .is_err()
    );
}
