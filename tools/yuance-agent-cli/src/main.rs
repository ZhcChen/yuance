use clap::Parser;
use serde_json::{Value, json};
use yuance_agent::{
    cli::{Cli, Command},
    client::{ApiClient, ClientConfig},
    error::AgentError,
    output,
};

#[tokio::main]
async fn main() {
    let cli = Cli::parse();
    let result = run(cli.command).await;

    match result {
        Ok(value) => output::write_success(&value, cli.pretty),
        Err(error) => {
            output::write_error(&error, cli.pretty);
            std::process::exit(error.exit_code());
        }
    }
}

async fn run(command: Command) -> Result<Value, AgentError> {
    match command {
        Command::Doctor { installation } => {
            if installation {
                return Ok(installation_status());
            }

            let config = ClientConfig::from_env()?;
            let base_url = config.base_url().to_string();
            let client = ApiClient::from_config(config)?;
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
