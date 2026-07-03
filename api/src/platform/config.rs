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

    pub fn session_ttl_seconds(&self) -> AppResult<i64> {
        parse_duration_seconds("YUANCE_SESSION_TTL", &self.session_ttl)
    }
}

fn env_string(name: &str, default: &str) -> String {
    env::var(name).unwrap_or_else(|_| default.to_string())
}

fn parse_duration_seconds(name: &str, value: &str) -> AppResult<i64> {
    let value = value.trim();
    if value.is_empty() {
        return Err(AppError::Config(format!("{name} 不能为空")));
    }

    let (number, multiplier) = match value.chars().last().expect("value should not be empty") {
        unit if unit.is_ascii_alphabetic() => {
            let number = &value[..value.len() - 1];
            let multiplier = match unit.to_ascii_lowercase() {
                's' => 1,
                'm' => 60,
                'h' => 60 * 60,
                'd' => 24 * 60 * 60,
                _ => {
                    return Err(AppError::Config(format!(
                        "{name} 仅支持秒(s)、分钟(m)、小时(h)、天(d)单位"
                    )));
                }
            };
            (number, multiplier)
        }
        _ => (value, 1),
    };

    let amount = number
        .trim()
        .parse::<i64>()
        .map_err(|_| AppError::Config(format!("{name} 必须是正整数，可附加 s/m/h/d 单位")))?;
    if amount <= 0 {
        return Err(AppError::Config(format!("{name} 必须大于 0")));
    }

    amount
        .checked_mul(multiplier)
        .ok_or_else(|| AppError::Config(format!("{name} 数值过大")))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn settings_with_session_ttl(session_ttl: &str) -> Settings {
        Settings {
            http_addr: "127.0.0.1:33033"
                .parse()
                .expect("test socket address should parse"),
            database_url: "sqlite::memory:".to_string(),
            data_dir: "data".to_string(),
            session_secret: "test-session-secret".to_string(),
            session_ttl: session_ttl.to_string(),
            cache_session_ttl: "5m".to_string(),
            log_level: "off".to_string(),
            env: "test".to_string(),
            security_master_key: "test-master-key-that-is-long-enough".to_string(),
        }
    }

    #[test]
    fn session_ttl_seconds_accepts_supported_units_and_plain_seconds() {
        assert_eq!(
            settings_with_session_ttl("30s")
                .session_ttl_seconds()
                .expect("seconds should parse"),
            30
        );
        assert_eq!(
            settings_with_session_ttl("15m")
                .session_ttl_seconds()
                .expect("minutes should parse"),
            900
        );
        assert_eq!(
            settings_with_session_ttl("2h")
                .session_ttl_seconds()
                .expect("hours should parse"),
            7200
        );
        assert_eq!(
            settings_with_session_ttl("1d")
                .session_ttl_seconds()
                .expect("days should parse"),
            86400
        );
        assert_eq!(
            settings_with_session_ttl("45")
                .session_ttl_seconds()
                .expect("plain seconds should parse"),
            45
        );
    }

    #[test]
    fn session_ttl_seconds_rejects_invalid_values() {
        for value in ["", "0", "-1", "abc", "1w"] {
            let error = settings_with_session_ttl(value)
                .session_ttl_seconds()
                .expect_err("invalid ttl should be rejected");
            assert!(error.to_string().contains("YUANCE_SESSION_TTL"));
        }
    }

    #[test]
    fn local_seed_environment_guard_only_allows_local_like_envs() {
        let mut settings = settings_with_session_ttl("12h");
        for env in ["development", "test", "local"] {
            settings.env = env.to_string();
            assert!(settings.allows_local_seed());
        }

        for env in ["production", "staging", ""] {
            settings.env = env.to_string();
            assert!(!settings.allows_local_seed());
        }
    }
}
