use std::{fs, path::PathBuf};

#[test]
fn skill_has_valid_trigger_metadata_and_core_boundaries() {
    let skill = read("SKILL.md");
    assert!(skill.starts_with("---\nname: yuance-agent\ndescription:"));
    assert!(skill.contains("项目、需求、任务、Bug 与工作项评论"));
    assert!(skill.contains("普通本地代码任务"));
    assert!(skill.contains("写操作前读取目标工作项"));
    assert!(skill.contains("状态变化或处理人变化只使用 `work-items handoff`"));
    assert!(skill.contains("首版只支持项目、工作项和工作项评论命令"));
}

#[test]
fn skill_uses_self_contained_cli_and_one_level_references() {
    let skill = read("SKILL.md");
    for reference in ["commands.md", "workflows.md", "errors.md"] {
        assert!(skill.contains(&format!("references/{reference}")));
        assert!(skill_root().join("references").join(reference).is_file());
    }
    assert!(skill.contains("<skill-dir>/scripts/yuance-agent"));
    assert!(skill.contains("<skill-dir>\\scripts\\yuance-agent.exe"));

    let forbidden = [
        "docs/".to_string(),
        "tools/".to_string(),
        "/Users/".to_string(),
        "mcp/".to_string(),
        ["yuance_", "list_"].concat(),
    ];
    for forbidden in forbidden {
        assert!(
            !package_text().contains(&forbidden),
            "Skill package contains repository coupling: {forbidden}"
        );
    }
}

#[test]
fn command_reference_covers_supported_surface_and_update_boundary() {
    let commands = read("references/commands.md");
    for command in [
        "doctor --installation",
        "projects list",
        "projects get",
        "work-items list",
        "work-items get",
        "work-items create",
        "work-items update",
        "work-items handoff",
        "comments list",
        "comments create",
    ] {
        assert!(commands.contains(command), "missing command: {command}");
    }
    let update = commands
        .split("## 更新元数据")
        .nth(1)
        .unwrap()
        .split("## 流转与指派")
        .next()
        .unwrap();
    assert!(!update.contains("--status"));
    assert!(!update.contains("--assignee-username"));
    assert!(commands.contains("--description-file <PATH|->"));
    assert!(commands.contains("--body-file <PATH|->"));
}

#[test]
fn workflows_enforce_read_before_write_and_reject_unsupported_actions() {
    let workflows = read("references/workflows.md");
    assert!(workflows.contains("创建一个任务"));
    assert!(workflows.contains("缺少项目和标题，应先询问，不执行创建命令"));
    assert!(workflows.contains("YCE-BUG-12"));
    assert!(workflows.contains("先读取详情与评论"));
    assert!(workflows.contains("不尝试猜测命令"));
}

#[test]
fn openai_metadata_is_complete_without_tool_dependencies() {
    let metadata = read("agents/openai.yaml");
    assert!(metadata.contains("display_name:"));
    assert!(metadata.contains("short_description:"));
    assert!(metadata.contains("default_prompt:"));
    assert!(metadata.contains("$yuance-agent"));
    assert!(!metadata.contains("dependencies:"));
}

fn package_text() -> String {
    [
        "SKILL.md",
        "agents/openai.yaml",
        "references/commands.md",
        "references/workflows.md",
        "references/errors.md",
    ]
    .map(read)
    .join("\n")
}

fn read(relative: &str) -> String {
    fs::read_to_string(skill_root().join(relative))
        .unwrap_or_else(|error| panic!("failed to read {relative}: {error}"))
}

fn skill_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../skills/yuance-agent")
}
