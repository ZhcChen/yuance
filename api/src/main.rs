#[tokio::main]
async fn main() -> Result<(), yuance_api::platform::error::AppError> {
    yuance_api::app::run_cli().await
}
