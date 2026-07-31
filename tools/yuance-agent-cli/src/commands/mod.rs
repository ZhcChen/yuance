use std::{io::Read, path::Path};

use serde_json::{Value, json};

use crate::{
    cli::{Command, CommentsCommand, ProjectsCommand, WorkItemsCommand},
    client::{ApiClient, ClientConfig},
    error::AgentError,
};

mod comments;
mod projects;
mod work_items;

pub async fn run(command: Command) -> Result<Value, AgentError> {
    if let Command::Doctor { installation: true } = command {
        return Ok(installation_status());
    }

    let config = ClientConfig::from_env()?;
    let base_url = config.base_url().to_string();
    let client = ApiClient::from_config(config)?;

    match command {
        Command::Doctor {
            installation: false,
        } => {
            let auth = client.get("/api/v1/auth/me", &[]).await?;
            let authenticated_user = auth.get("data").cloned().unwrap_or(Value::Null);
            Ok(json!({
                "data": {
                    "status": "ready",
                    "version": env!("CARGO_PKG_VERSION"),
                    "target": target_name(),
                    "base_url": base_url,
                    "authenticated_user": authenticated_user
                }
            }))
        }
        Command::Doctor { installation: true } => unreachable!(),
        Command::Projects { command } => match command {
            ProjectsCommand::List(args) => projects::list(&client, args).await,
            ProjectsCommand::Get { project_key } => projects::get(&client, &project_key).await,
        },
        Command::WorkItems { command } => match command {
            WorkItemsCommand::List(args) => work_items::list(&client, args).await,
            WorkItemsCommand::Get { item_key } => work_items::get(&client, &item_key).await,
            WorkItemsCommand::Create(args) => work_items::create(&client, args).await,
            WorkItemsCommand::Update(args) => work_items::update(&client, args).await,
            WorkItemsCommand::Handoff(args) => work_items::handoff(&client, args).await,
        },
        Command::Comments { command } => match command {
            CommentsCommand::List { item_key } => comments::list(&client, &item_key).await,
            CommentsCommand::Create(args) => comments::create(&client, args).await,
        },
    }
}

pub(super) fn read_text(
    direct: Option<String>,
    file: Option<&Path>,
    field_name: &'static str,
) -> Result<Option<String>, AgentError> {
    if let Some(value) = direct {
        return Ok(Some(value));
    }
    let Some(path) = file else {
        return Ok(None);
    };

    let value = if path == Path::new("-") {
        let mut value = String::new();
        std::io::stdin()
            .read_to_string(&mut value)
            .map_err(|error| input_error(field_name, error))?;
        value
    } else {
        std::fs::read_to_string(path).map_err(|error| input_error(field_name, error))?
    };
    Ok(Some(value))
}

pub(super) fn require_non_empty(value: &str, field_name: &'static str) -> Result<(), AgentError> {
    if value.trim().is_empty() {
        return Err(AgentError::Config {
            code: "empty_input",
            message: format!("{field_name} 不能为空"),
        });
    }
    Ok(())
}

fn input_error(field_name: &'static str, error: std::io::Error) -> AgentError {
    AgentError::Config {
        code: "input_read_failed",
        message: format!("读取 {field_name} 失败: {error}"),
    }
}

fn installation_status() -> Value {
    json!({
        "data": {
            "status": "installed",
            "version": env!("CARGO_PKG_VERSION"),
            "target": target_name()
        }
    })
}

fn target_name() -> String {
    format!("{}-{}", std::env::consts::ARCH, std::env::consts::OS)
}
