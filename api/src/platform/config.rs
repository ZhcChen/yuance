use std::{env, net::SocketAddr, path::Path};

use crate::platform::error::{AppError, AppResult};

#[derive(Clone, Debug)]
pub struct Settings {
    pub http_addr: SocketAddr,
    pub database_url: String,
    pub data_dir: String,
    pub session_secret: String,
    pub session_ttl: String,
    pub cache_session_ttl: String,
    pub log_level: String,
    pub env: String,
    pub security_master_key: String,
}

impl Settings {
    pub fn load_dotenv() {
        if Path::new("api/.env").exists() {
            let _ = dotenvy::from_path("api/.env");
        } else {
            let _ = dotenvy::dotenv();
        }
    }

    pub fn from_env() -> AppResult<Self> {
        let http_addr = env_string("YUANCE_HTTP_ADDR", "127.0.0.1:33033").parse()?;
        let settings = Self {
            http_addr,
            database_url: env_string("YUANCE_DATABASE_URL", "sqlite://data/yuance.sqlite3"),
            data_dir: env_string("YUANCE_DATA_DIR", "data"),
            session_secret: env_string("YUANCE_SESSION_SECRET", "change-me"),
            session_ttl: env_string("YUANCE_SESSION_TTL", "12h"),
            cache_session_ttl: env_string("YUANCE_CACHE_SESSION_TTL", "5m"),
            log_level: env_string("YUANCE_LOG_LEVEL", "info"),
            env: env_string("YUANCE_ENV", "development"),
            security_master_key: env_string(
                "YUANCE_SECURITY_MASTER_KEY",
                "change-me-32-byte-minimum",
            ),
        };

        if settings.env.trim().is_empty() {
            return Err(AppError::Config("YUANCE_ENV 不能为空".to_string()));
        }

        Ok(settings)
    }

    pub fn allows_local_seed(&self) -> bool {
        matches!(self.env.as_str(), "development" | "test" | "local")
    }
}

fn env_string(name: &str, default: &str) -> String {
    env::var(name).unwrap_or_else(|_| default.to_string())
}
