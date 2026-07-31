use clap::Parser;
use yuance_agent::{cli::Cli, commands, output};

#[tokio::main]
async fn main() {
    let cli = Cli::parse();
    let result = commands::run(cli.command).await;

    match result {
        Ok(value) => output::write_success(&value, cli.pretty),
        Err(error) => {
            output::write_error(&error, cli.pretty);
            std::process::exit(error.exit_code());
        }
    }
}
