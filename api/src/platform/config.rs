use std::{
    env,
    net::SocketAddr,
    path::{Path, PathBuf},
};

use crate::platform::error::{AppError, AppResult};

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
    pub device_sessions: DeviceSessionSettings,
    pub experimental_legacy_preview_enabled: bool,
}

#[derive(Clone, Debug)]
pub struct DeviceSessionSettings {
    pub server_instance_id: String,
    pub trusted_proxy_cidrs: String,
    pub authorization_ttl: String,
    pub access_ttl: String,
    pub refresh_sliding_ttl: String,
    pub refresh_absolute_ttl: String,
    pub idempotency_ttl: String,
    pub poll_interval: String,
    pub control_revalidation_interval: String,
    pub control_revalidation_timeout: String,
    pub control_max_active_streams: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct DeviceSessionDurations {
    pub authorization_ttl_seconds: i64,
    pub access_ttl_seconds: i64,
    pub refresh_sliding_ttl_seconds: i64,
    pub refresh_absolute_ttl_seconds: i64,
    pub idempotency_ttl_seconds: i64,
    pub poll_interval_seconds: i64,
    pub control_revalidation_interval_ms: i64,
    pub control_revalidation_timeout_ms: i64,
}

impl Default for DeviceSessionSettings {
    fn default() -> Self {
        Self {
            server_instance_id: "local-development".to_string(),
            trusted_proxy_cidrs: "127.0.0.0/8".to_string(),
            authorization_ttl: "10m".to_string(),
            access_ttl: "15m".to_string(),
            refresh_sliding_ttl: "30d".to_string(),
            refresh_absolute_ttl: "90d".to_string(),
            idempotency_ttl: "24h".to_string(),
            poll_interval: "5s".to_string(),
            control_revalidation_interval: "1s".to_string(),
            control_revalidation_timeout: "500ms".to_string(),
            control_max_active_streams: "1024".to_string(),
        }
    }
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
        let default_server_instance_id = if env == "production" {
            ""
        } else {
            "local-development"
        };
        let settings = Self {
            http_addr,
            database_url: env_string("YUANCE_DATABASE_URL", "sqlite://data/yuance.sqlite3"),
            data_dir: env_string("YUANCE_DATA_DIR", "data"),
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
            device_sessions: DeviceSessionSettings {
                server_instance_id: env_string(
                    "YUANCE_SERVER_INSTANCE_ID",
                    default_server_instance_id,
                )
                .trim()
                .to_string(),
                trusted_proxy_cidrs: env_string("YUANCE_DEVICE_TRUSTED_PROXY_CIDRS", "127.0.0.0/8"),
                authorization_ttl: env_string("YUANCE_DEVICE_AUTHORIZATION_TTL", "10m"),
                access_ttl: env_string("YUANCE_DEVICE_ACCESS_TTL", "15m"),
                refresh_sliding_ttl: env_string("YUANCE_DEVICE_REFRESH_SLIDING_TTL", "30d"),
                refresh_absolute_ttl: env_string("YUANCE_DEVICE_REFRESH_ABSOLUTE_TTL", "90d"),
                idempotency_ttl: env_string("YUANCE_DEVICE_IDEMPOTENCY_TTL", "24h"),
                poll_interval: env_string("YUANCE_DEVICE_POLL_INTERVAL", "5s"),
                control_revalidation_interval: env_string(
                    "YUANCE_DEVICE_CONTROL_REVALIDATION_INTERVAL", "1s",
                ),
                control_revalidation_timeout: env_string(
                    "YUANCE_DEVICE_CONTROL_REVALIDATION_TIMEOUT", "500ms",
                ),
                control_max_active_streams: env_string(
                    "YUANCE_DEVICE_CONTROL_MAX_ACTIVE_STREAMS", "1024",
                ),
            },
            experimental_legacy_preview_enabled: env_flag_enabled(
                "YUANCE_EXPERIMENTAL_LEGACY_PREVIEW_ENABLED",
            ),
        };

        if settings.env.trim().is_empty() {
            return Err(AppError::Config("YUANCE_ENV 不能为空".to_string()));
        }
        settings.device_sessions.validate(&settings.env)?;

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

    pub fn web_dist_dir(&self) -> PathBuf {
        match env::var("YUANCE_WEB_DIST_DIR") {
            Ok(value) if !value.trim().is_empty() => PathBuf::from(value.trim()),
            _ => PathBuf::from("web/dist"),
        }
    }

    pub fn web_app_shell_v1_enabled(&self) -> bool {
        env_flag_enabled("YUANCE_WEB_APP_SHELL_V1")
    }

    pub fn experimental_legacy_preview_enabled(&self) -> bool {
        self.experimental_legacy_preview_enabled
    }
}

impl DeviceSessionSettings {
    pub fn validate(&self, environment: &str) -> AppResult<DeviceSessionDurations> {
        validate_server_instance_id(&self.server_instance_id, environment)?;
        self.trusted_proxy_networks()?;

        let durations = DeviceSessionDurations {
            authorization_ttl_seconds: parse_duration_seconds(
                "YUANCE_DEVICE_AUTHORIZATION_TTL",
                &self.authorization_ttl,
            )?,
            access_ttl_seconds: parse_duration_seconds(
                "YUANCE_DEVICE_ACCESS_TTL",
                &self.access_ttl,
            )?,
            refresh_sliding_ttl_seconds: parse_duration_seconds(
                "YUANCE_DEVICE_REFRESH_SLIDING_TTL",
                &self.refresh_sliding_ttl,
            )?,
            refresh_absolute_ttl_seconds: parse_duration_seconds(
                "YUANCE_DEVICE_REFRESH_ABSOLUTE_TTL",
                &self.refresh_absolute_ttl,
            )?,
            idempotency_ttl_seconds: parse_duration_seconds(
                "YUANCE_DEVICE_IDEMPOTENCY_TTL",
                &self.idempotency_ttl,
            )?,
            poll_interval_seconds: parse_duration_seconds(
                "YUANCE_DEVICE_POLL_INTERVAL",
                &self.poll_interval,
            )?,
            control_revalidation_interval_ms: parse_duration_millis(
                "YUANCE_DEVICE_CONTROL_REVALIDATION_INTERVAL",
                &self.control_revalidation_interval,
            )?,
            control_revalidation_timeout_ms: parse_duration_millis(
                "YUANCE_DEVICE_CONTROL_REVALIDATION_TIMEOUT",
                &self.control_revalidation_timeout,
            )?,
        };

        validate_control_stream_timing(
            durations.control_revalidation_interval_ms,
            durations.control_revalidation_timeout_ms,
        )?;
        self.control_max_active_streams()?;

        validate_duration_range(
            "YUANCE_DEVICE_AUTHORIZATION_TTL",
            durations.authorization_ttl_seconds,
            5 * 60,
            15 * 60,
        )?;
        validate_duration_range(
            "YUANCE_DEVICE_ACCESS_TTL",
            durations.access_ttl_seconds,
            60,
            60 * 60,
        )?;
        validate_duration_range(
            "YUANCE_DEVICE_POLL_INTERVAL",
            durations.poll_interval_seconds,
            2,
            15,
        )?;
        if durations.refresh_sliding_ttl_seconds < durations.access_ttl_seconds {
            return Err(AppError::Config(
                "YUANCE_DEVICE_REFRESH_SLIDING_TTL 不能短于 YUANCE_DEVICE_ACCESS_TTL".to_string(),
            ));
        }
        validate_duration_range(
            "YUANCE_DEVICE_REFRESH_SLIDING_TTL",
            durations.refresh_sliding_ttl_seconds,
            24 * 60 * 60,
            30 * 24 * 60 * 60,
        )?;
        validate_duration_range(
            "YUANCE_DEVICE_REFRESH_ABSOLUTE_TTL",
            durations.refresh_absolute_ttl_seconds,
            24 * 60 * 60,
            180 * 24 * 60 * 60,
        )?;
        validate_duration_range(
            "YUANCE_DEVICE_IDEMPOTENCY_TTL",
            durations.idempotency_ttl_seconds,
            60 * 60,
            7 * 24 * 60 * 60,
        )?;
        if durations.refresh_absolute_ttl_seconds < durations.refresh_sliding_ttl_seconds {
            return Err(AppError::Config(
                "YUANCE_DEVICE_REFRESH_ABSOLUTE_TTL 不能短于 YUANCE_DEVICE_REFRESH_SLIDING_TTL"
                    .to_string(),
            ));
        }
        if durations.idempotency_ttl_seconds < durations.authorization_ttl_seconds
            || durations.idempotency_ttl_seconds > durations.refresh_sliding_ttl_seconds
        {
            return Err(AppError::Config(
                "YUANCE_DEVICE_IDEMPOTENCY_TTL 必须不短于 authorization TTL 且不长于 refresh sliding TTL"
                    .to_string(),
            ));
        }

        Ok(durations)
    }

    pub fn control_stream_timing(&self) -> AppResult<(std::time::Duration, std::time::Duration)> {
        let interval = parse_duration_millis(
            "YUANCE_DEVICE_CONTROL_REVALIDATION_INTERVAL",
            &self.control_revalidation_interval,
        )?;
        let timeout = parse_duration_millis(
            "YUANCE_DEVICE_CONTROL_REVALIDATION_TIMEOUT",
            &self.control_revalidation_timeout,
        )?;
        validate_control_stream_timing(interval, timeout)?;
        Ok((
            std::time::Duration::from_millis(interval as u64),
            std::time::Duration::from_millis(timeout as u64),
        ))
    }

    pub fn control_max_active_streams(&self) -> AppResult<usize> {
        let value = self.control_max_active_streams.trim().parse::<usize>().map_err(|_| {
            AppError::Config("YUANCE_DEVICE_CONTROL_MAX_ACTIVE_STREAMS 必须是正整数".to_string())
        })?;
        if !(16..=10_000).contains(&value) {
            return Err(AppError::Config(
                "YUANCE_DEVICE_CONTROL_MAX_ACTIVE_STREAMS 必须介于 16 和 10000".to_string(),
            ));
        }
        Ok(value)
    }

    pub fn trusted_proxy_networks(&self) -> AppResult<Vec<ipnet::IpNet>> {
        self.trusted_proxy_cidrs
            .split(',')
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(|value| {
                value.parse::<ipnet::IpNet>().map_err(|_| {
                    AppError::Config(format!(
                        "YUANCE_DEVICE_TRUSTED_PROXY_CIDRS 包含无效 CIDR：{value}"
                    ))
                })
            })
            .collect()
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

fn parse_duration_millis(name: &str, value: &str) -> AppResult<i64> {
    let value = value.trim();
    if let Some(number) = value.strip_suffix("ms") {
        let amount = number.trim().parse::<i64>()
            .map_err(|_| AppError::Config(format!("{name} 必须是正整数毫秒值")))?;
        if amount <= 0 { return Err(AppError::Config(format!("{name} 必须大于 0"))); }
        return Ok(amount);
    }
    parse_duration_seconds(name, value)?.checked_mul(1_000)
        .ok_or_else(|| AppError::Config(format!("{name} 数值过大")))
}

fn validate_control_stream_timing(interval_ms: i64, timeout_ms: i64) -> AppResult<()> {
    const SCHEDULER_MARGIN_MS: i64 = 500;
    const REVOCATION_DEADLINE_MS: i64 = 5_000;
    if !(250..=1_000).contains(&interval_ms) {
        return Err(AppError::Config(
            "YUANCE_DEVICE_CONTROL_REVALIDATION_INTERVAL 必须介于 250ms 和 1s".to_string(),
        ));
    }
    if !(100..=500).contains(&timeout_ms) {
        return Err(AppError::Config(
            "YUANCE_DEVICE_CONTROL_REVALIDATION_TIMEOUT 必须介于 100ms 和 500ms".to_string(),
        ));
    }
    if interval_ms + timeout_ms + SCHEDULER_MARGIN_MS >= REVOCATION_DEADLINE_MS {
        return Err(AppError::Config(
            "Device control stream 重验预算必须严格小于 5 秒撤销 deadline".to_string(),
        ));
    }
    Ok(())
}

fn validate_server_instance_id(value: &str, environment: &str) -> AppResult<()> {
    let value = value.trim();
    if value.is_empty() {
        return Err(AppError::Config(
            "YUANCE_SERVER_INSTANCE_ID 不能为空".to_string(),
        ));
    }
    if value.len() > 128
        || !value
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_'))
    {
        return Err(AppError::Config(
            "YUANCE_SERVER_INSTANCE_ID 只能包含字母、数字、中划线和下划线，且不能超过 128 个字符"
                .to_string(),
        ));
    }
    if environment == "production" && value == "local-development" {
        return Err(AppError::Config(
            "生产环境必须显式配置 YUANCE_SERVER_INSTANCE_ID".to_string(),
        ));
    }
    Ok(())
}

fn validate_duration_range(name: &str, value: i64, minimum: i64, maximum: i64) -> AppResult<()> {
    if !(minimum..=maximum).contains(&value) {
        return Err(AppError::Config(format!(
            "{name} 必须在 {minimum}-{maximum} 秒之间"
        )));
    }
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
            device_sessions: DeviceSessionSettings::default(),
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
    fn device_session_defaults_are_valid_for_local_runtime() {
        assert_eq!(
            DeviceSessionSettings::default()
                .validate("test")
                .expect("defaults should validate"),
            DeviceSessionDurations {
                authorization_ttl_seconds: 600,
                access_ttl_seconds: 900,
                refresh_sliding_ttl_seconds: 30 * 24 * 60 * 60,
                refresh_absolute_ttl_seconds: 90 * 24 * 60 * 60,
                idempotency_ttl_seconds: 24 * 60 * 60,
                poll_interval_seconds: 5,
                control_revalidation_interval_ms: 1_000,
                control_revalidation_timeout_ms: 500,
            }
        );
    }

    #[test]
    fn device_session_settings_reject_unsafe_relationships() {
        let cases = [
            ("authorization_ttl", "2m"),
            ("access_ttl", "2h"),
            ("poll_interval", "1s"),
            ("refresh_sliding_ttl", "10m"),
            ("refresh_sliding_ttl", "31d"),
            ("refresh_absolute_ttl", "1d"),
            ("refresh_absolute_ttl", "181d"),
            ("idempotency_ttl", "1m"),
            ("idempotency_ttl", "8d"),
            ("control_revalidation_interval", "3s"),
            ("control_revalidation_timeout", "2s"),
            ("control_max_active_streams", "8"),
        ];

        for (field, value) in cases {
            let mut settings = DeviceSessionSettings::default();
            match field {
                "authorization_ttl" => settings.authorization_ttl = value.to_string(),
                "access_ttl" => settings.access_ttl = value.to_string(),
                "poll_interval" => settings.poll_interval = value.to_string(),
                "refresh_sliding_ttl" => settings.refresh_sliding_ttl = value.to_string(),
                "refresh_absolute_ttl" => settings.refresh_absolute_ttl = value.to_string(),
                "idempotency_ttl" => settings.idempotency_ttl = value.to_string(),
                "control_revalidation_interval" => settings.control_revalidation_interval = value.to_string(),
                "control_revalidation_timeout" => settings.control_revalidation_timeout = value.to_string(),
                "control_max_active_streams" => settings.control_max_active_streams = value.to_string(),
                _ => unreachable!(),
            }
            assert!(
                settings.validate("test").is_err(),
                "{field}={value} should be rejected"
            );
        }
    }

    #[test]
    fn production_rejects_local_or_invalid_server_identity() {
        for server_instance_id in ["", "local-development", "contains spaces", "bad/path"] {
            let settings = DeviceSessionSettings {
                server_instance_id: server_instance_id.to_string(),
                ..DeviceSessionSettings::default()
            };
            assert!(settings.validate("production").is_err());
        }
    }

    #[test]
    fn trusted_proxy_cidrs_accept_explicit_networks_and_empty_configuration() {
        let mut settings = DeviceSessionSettings {
            trusted_proxy_cidrs: "127.0.0.0/8, 172.16.0.0/12".to_string(),
            ..DeviceSessionSettings::default()
        };
        let networks = settings
            .trusted_proxy_networks()
            .expect("valid CIDRs should parse");
        assert_eq!(networks.len(), 2);
        let loopback: std::net::IpAddr = "127.0.0.1".parse().unwrap();
        let docker_peer: std::net::IpAddr = "172.17.0.1".parse().unwrap();
        assert!(networks[0].contains(&loopback));
        assert!(networks[1].contains(&docker_peer));

        settings.trusted_proxy_cidrs.clear();
        assert!(settings.trusted_proxy_networks().unwrap().is_empty());
        assert!(settings.validate("test").is_ok());
    }

    #[test]
    fn trusted_proxy_cidrs_reject_invalid_networks() {
        let settings = DeviceSessionSettings {
            trusted_proxy_cidrs: "127.0.0.0/8,not-a-cidr".to_string(),
            ..DeviceSessionSettings::default()
        };
        let error = settings
            .validate("test")
            .expect_err("invalid trusted proxy CIDR should fail startup validation");
        assert!(
            error
                .to_string()
                .contains("YUANCE_DEVICE_TRUSTED_PROXY_CIDRS")
        );
    }

    #[test]
    fn environment_names_are_normalized_before_security_checks() {
        for raw_environment in ["production", "Production", "PRODUCTION", " production "] {
            let normalized = normalize_environment(raw_environment);
            assert_eq!(normalized, "production");
            assert!(
                DeviceSessionSettings::default()
                    .validate(&normalized)
                    .is_err(),
                "{raw_environment:?} must use production safeguards"
            );
        }
    }
}
