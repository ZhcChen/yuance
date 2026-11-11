use std::{
    env, fs,
    net::SocketAddr,
    path::{Path, PathBuf},
};

use base64::{Engine, engine::general_purpose::STANDARD as BASE64};
use rand_core::{OsRng, RngCore};

use crate::platform::error::{AppError, AppResult};

const FILE_MASTER_KEY_FILE_NAME: &str = "file_master_key";
const FILE_MASTER_KEY_MIN_LEN: usize = 16;

#[derive(Clone, Debug)]
pub struct Settings {
    pub http_addr: SocketAddr,
    pub database_url: String,
    pub data_dir: String,
    pub session_secret: String,
    pub session_ttl: String,
    pub refresh_session_ttl: String,
    pub cache_session_ttl: String,
    pub log_level: String,
    pub env: String,
    pub security_master_key: String,
    pub file_master_key: String,
    pub experimental_legacy_preview_enabled: bool,
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
        let env = normalize_environment(&env_string("YUANCE_ENV", "development"));
        let data_dir = env_string("YUANCE_DATA_DIR", "data");
        let file_master_key =
            resolve_file_master_key(&data_dir, &env, &env_string("YUANCE_FILE_MASTER_KEY", ""))?;
        let settings = Self {
            http_addr,
            database_url: env_string("YUANCE_DATABASE_URL", "sqlite://data/yuance.sqlite3"),
            data_dir: data_dir.clone(),
            session_secret: env_string("YUANCE_SESSION_SECRET", "change-me"),
            session_ttl: env_string("YUANCE_SESSION_TTL", "2h"),
            refresh_session_ttl: env_string("YUANCE_REFRESH_SESSION_TTL", "30d"),
            cache_session_ttl: env_string("YUANCE_CACHE_SESSION_TTL", "5m"),
            log_level: env_string("YUANCE_LOG_LEVEL", "info"),
            env,
            security_master_key: env_string(
                "YUANCE_SECURITY_MASTER_KEY",
                "change-me-32-byte-minimum",
            ),
            file_master_key,
            experimental_legacy_preview_enabled: env_flag_enabled(
                "YUANCE_EXPERIMENTAL_LEGACY_PREVIEW_ENABLED",
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

    pub fn refresh_session_ttl_seconds(&self) -> AppResult<i64> {
        parse_duration_seconds("YUANCE_REFRESH_SESSION_TTL", &self.refresh_session_ttl)
    }

    pub fn cache_session_ttl_seconds(&self) -> AppResult<i64> {
        parse_duration_seconds("YUANCE_CACHE_SESSION_TTL", &self.cache_session_ttl)
    }

    pub fn web_dist_dir(&self) -> PathBuf {
        match env::var("YUANCE_WEB_DIST_DIR") {
            Ok(value) if !value.trim().is_empty() => PathBuf::from(value.trim()),
            _ => PathBuf::from("web/dist"),
        }
    }

    pub fn experimental_legacy_preview_enabled(&self) -> bool {
        self.experimental_legacy_preview_enabled
    }
}

fn env_string(name: &str, default: &str) -> String {
    env::var(name).unwrap_or_else(|_| default.to_string())
}

fn normalize_environment(value: &str) -> String {
    value.trim().to_ascii_lowercase()
}

fn env_flag_enabled(name: &str) -> bool {
    matches!(
        env::var(name)
            .ok()
            .map(|value| value.trim().to_ascii_lowercase()),
        Some(value)
            if matches!(value.as_str(), "1" | "true" | "enabled" | "on" | "yes")
    )
}

fn parse_duration_seconds(name: &str, value: &str) -> AppResult<i64> {
    let value = value.trim();
    if value.is_empty() {
        return Err(AppError::Config(format!("{name} 不能为空")));
    }

    let Some(unit) = value.chars().last() else {
        return Err(AppError::Config(format!("{name} 不能为空")));
    };

    let (number, multiplier) = match unit {
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

fn resolve_file_master_key(
    data_dir: &str,
    environment: &str,
    env_value: &str,
) -> AppResult<String> {
    let explicit = env_value.trim();
    if !explicit.is_empty() {
        if explicit.len() < FILE_MASTER_KEY_MIN_LEN {
            return Err(AppError::Config(
                "YUANCE_FILE_MASTER_KEY 长度不能少于 16 个字符".to_string(),
            ));
        }
        return Ok(explicit.to_string());
    }

    let secrets_dir = Path::new(data_dir).join("secrets");
    let key_path = secrets_dir.join(FILE_MASTER_KEY_FILE_NAME);
    if let Ok(content) = fs::read_to_string(&key_path) {
        let stored = content.trim();
        if stored.len() < FILE_MASTER_KEY_MIN_LEN {
            return Err(AppError::Config(format!(
                "文件主密钥文件 {} 内容无效，请检查或重新初始化",
                key_path.display()
            )));
        }
        return Ok(stored.to_string());
    }

    if environment == "test" {
        return Ok("test-file-master-key-that-is-long-enough".to_string());
    }

    let mut key_bytes = [0_u8; 32];
    OsRng.fill_bytes(&mut key_bytes);
    let generated = BASE64.encode(key_bytes);
    fs::create_dir_all(&secrets_dir).map_err(|error| {
        AppError::Config(format!(
            "创建文件主密钥目录失败（{}）：{error}",
            secrets_dir.display()
        ))
    })?;
    fs::write(&key_path, generated.as_bytes()).map_err(|error| {
        AppError::Config(format!(
            "写入文件主密钥失败（{}）：{error}",
            key_path.display()
        ))
    })?;
    set_private_file_permissions(&key_path)?;
    eprintln!(
        "[yuance] 已生成文件主密钥：{}（请单独备份该文件）",
        key_path.display()
    );
    Ok(generated)
}

#[cfg(unix)]
fn set_private_file_permissions(path: &Path) -> AppResult<()> {
    use std::os::unix::fs::PermissionsExt;

    fs::set_permissions(path, fs::Permissions::from_mode(0o600)).map_err(|error| {
        AppError::Config(format!(
            "设置文件主密钥权限失败（{}）：{error}",
            path.display()
        ))
    })
}

#[cfg(not(unix))]
fn set_private_file_permissions(_path: &Path) -> AppResult<()> {
    Ok(())
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
            refresh_session_ttl: "30d".to_string(),
            cache_session_ttl: "5m".to_string(),
            log_level: "off".to_string(),
            env: "test".to_string(),
            security_master_key: "test-master-key-that-is-long-enough".to_string(),
            file_master_key: "test-file-master-key-that-is-long-enough".to_string(),
            experimental_legacy_preview_enabled: false,
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
    fn refresh_session_ttl_seconds_uses_separate_setting() {
        assert_eq!(
            settings_with_session_ttl("2h")
                .refresh_session_ttl_seconds()
                .expect("refresh ttl should parse"),
            30 * 24 * 60 * 60
        );
    }

    #[test]
    fn web_dist_dir_defaults_to_web_dist() {
        let settings = settings_with_session_ttl("2h");
        assert_eq!(settings.web_dist_dir(), PathBuf::from("web/dist"));
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

    #[test]
    fn environment_names_are_normalized_before_security_checks() {
        for raw_environment in ["production", "Production", "PRODUCTION", " production "] {
            let normalized = normalize_environment(raw_environment);
            assert_eq!(normalized, "production");
        }
    }
}
