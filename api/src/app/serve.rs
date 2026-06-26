use tokio::net::TcpListener;

use crate::{
    app::ServeArgs,
    platform::{config::Settings, db, error::AppResult, telemetry},
    web::router::{AppState, build_router},
};

pub async fn run(args: ServeArgs) -> AppResult<()> {
    let mut settings = Settings::from_env()?;
    if let Some(http_addr) = args.http_addr {
        settings.http_addr = http_addr.parse()?;
    }

    telemetry::init(&settings.log_level);

    let listener = TcpListener::bind(settings.http_addr).await?;
    let pool = db::connect_pool(&settings).await?;
    tracing::info!(
        addr = %settings.http_addr,
        env = %settings.env,
        "yuance-api listening"
    );

    let app = build_router(AppState::new(settings, Some(pool)));
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;

    Ok(())
}

async fn shutdown_signal() {
    let ctrl_c = async {
        if let Err(error) = tokio::signal::ctrl_c().await {
            tracing::warn!(%error, "failed to install ctrl-c handler");
        }
    };

    #[cfg(unix)]
    let terminate = async {
        match tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate()) {
            Ok(mut signal) => {
                signal.recv().await;
            }
            Err(error) => {
                tracing::warn!(%error, "failed to install terminate handler");
            }
        }
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }
}
