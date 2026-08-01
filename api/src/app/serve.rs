use tokio::net::TcpListener;

use crate::{
    app::ServeArgs,
    domains::device_sessions,
    platform::{config::Settings, db, error::AppResult, telemetry},
    web::router::{AppState, build_router},
};

pub async fn run(args: ServeArgs) -> AppResult<()> {
    let settings = settings_from_args(args)?;
    telemetry::init(&settings.log_level);

    let listener = TcpListener::bind(settings.http_addr).await?;
    let pool = db::connect_pool(&settings).await?;
    spawn_device_credential_cleanup(pool.clone());
    tracing::info!(
        addr = %settings.http_addr,
        env = %settings.env,
        "yuance-api listening"
    );

    let app = build_router(AppState::new(settings, Some(pool)));
    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<std::net::SocketAddr>(),
    )
    .with_graceful_shutdown(shutdown_signal())
    .await?;

    Ok(())
}

fn spawn_device_credential_cleanup(pool: sqlx::SqlitePool) {
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(60 * 60));
        loop {
            interval.tick().await;
            let now = chrono::Utc::now();
            match device_sessions::cleanup_expired_authorizations(&pool, now, 500).await {
                Ok(cleaned) if cleaned > 0 => {
                    tracing::info!(cleaned, "cleaned expired device authorizations");
                }
                Ok(_) => {}
                Err(error) => {
                    tracing::warn!(%error, "failed to clean expired device authorizations");
                }
            }
            match device_sessions::erase_expired_exchange_results(&pool, now).await {
                Ok(cleaned) if cleaned > 0 => {
                    tracing::info!(cleaned, "cleaned expired device exchange results");
                }
                Ok(_) => {}
                Err(error) => {
                    tracing::warn!(%error, "failed to clean expired device exchange results");
                }
            }
            match device_sessions::cleanup_expired_rotation_results(&pool, now, 500).await {
                Ok(cleaned) if cleaned > 0 => {
                    tracing::info!(cleaned, "cleaned expired device rotation results");
                }
                Ok(_) => {}
                Err(error) => {
                    tracing::warn!(%error, "failed to clean expired device rotation results");
                }
            }
        }
    });
}

pub(crate) fn settings_from_args(args: ServeArgs) -> AppResult<Settings> {
    let mut settings = Settings::from_env()?;
    if let Some(http_addr) = args.http_addr {
        settings.http_addr = http_addr.parse()?;
    }
    Ok(settings)
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

#[cfg(test)]
mod tests {
    use std::sync::{Mutex, OnceLock};

    use crate::app::{ServeArgs, serve::settings_from_args};

    static ENV_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

    #[test]
    fn serve_args_override_environment_http_addr() {
        let _guard = env_lock().lock().expect("env lock should acquire");
        with_base_env(|| {
            unsafe {
                std::env::set_var("YUANCE_HTTP_ADDR", "127.0.0.1:33034");
            }

            let settings = settings_from_args(ServeArgs {
                http_addr: Some("127.0.0.1:33035".to_string()),
            })
            .expect("settings should load");

            assert_eq!(settings.http_addr.to_string(), "127.0.0.1:33035");
        });
    }

    #[test]
    fn serve_args_reject_invalid_http_addr() {
        let _guard = env_lock().lock().expect("env lock should acquire");
        with_base_env(|| {
            let error = settings_from_args(ServeArgs {
                http_addr: Some("not-a-socket-address".to_string()),
            })
            .expect_err("invalid http addr should be rejected");

            assert!(error.to_string().contains("invalid socket address syntax"));
        });
    }

    fn with_base_env(action: impl FnOnce()) {
        let keys = [
            "YUANCE_HTTP_ADDR",
            "YUANCE_DATABASE_URL",
            "YUANCE_DATA_DIR",
            "YUANCE_ENV",
            "YUANCE_SESSION_SECRET",
            "YUANCE_SECURITY_MASTER_KEY",
            "YUANCE_LOG_LEVEL",
        ];
        let previous_values = keys
            .iter()
            .map(|key| (*key, std::env::var(key).ok()))
            .collect::<Vec<_>>();

        unsafe {
            std::env::set_var("YUANCE_DATABASE_URL", "sqlite::memory:");
            std::env::set_var("YUANCE_DATA_DIR", "data");
            std::env::set_var("YUANCE_ENV", "test");
            std::env::set_var("YUANCE_SESSION_SECRET", "serve-test-session-secret");
            std::env::set_var("YUANCE_SECURITY_MASTER_KEY", "serve-test-master-key-2026");
            std::env::set_var("YUANCE_LOG_LEVEL", "off");
        }

        action();

        for (key, value) in previous_values {
            unsafe {
                match value {
                    Some(value) => std::env::set_var(key, value),
                    None => std::env::remove_var(key),
                }
            }
        }
    }

    fn env_lock() -> &'static Mutex<()> {
        ENV_LOCK.get_or_init(|| Mutex::new(()))
    }
}
