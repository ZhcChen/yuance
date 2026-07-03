use axum::http::HeaderMap;

use crate::domains::audit::AuditContext;

pub fn from_headers(headers: &HeaderMap) -> AuditContext {
    AuditContext {
        ip: client_ip(headers),
        user_agent: header_value(headers, "user-agent", 256),
    }
}

fn client_ip(headers: &HeaderMap) -> String {
    forwarded_ip(headers)
        .or_else(|| header_value_optional(headers, "x-real-ip", 80))
        .unwrap_or_default()
}

fn forwarded_ip(headers: &HeaderMap) -> Option<String> {
    let value = header_value_optional(headers, "x-forwarded-for", 256)?;
    value
        .split(',')
        .map(str::trim)
        .find(|part| !part.is_empty())
        .map(|part| part.chars().take(80).collect())
}

fn header_value(headers: &HeaderMap, name: &str, max_chars: usize) -> String {
    header_value_optional(headers, name, max_chars).unwrap_or_default()
}

fn header_value_optional(headers: &HeaderMap, name: &str, max_chars: usize) -> Option<String> {
    headers
        .get(name)
        .and_then(|value| value.to_str().ok())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| value.chars().take(max_chars).collect())
}
