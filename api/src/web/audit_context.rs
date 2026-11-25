use axum::http::HeaderMap;

use crate::domains::audit::AuditContext;

pub fn from_headers(headers: &HeaderMap) -> AuditContext {
    AuditContext {
        ip: client_ip(headers),
        user_agent: header_value(headers, "user-agent", 256),
    }
}

/// 客户端 IP：优先网关覆盖写入的 `X-Real-IP`（Nginx 设为 `$remote_addr`，客户端无法伪造）；
/// `X-Forwarded-For` 是追加模式，第一段可由客户端任意填写，只作缺省回退。
/// 该值用于审计与登录限流的 IP 维度。
fn client_ip(headers: &HeaderMap) -> String {
    header_value_optional(headers, "x-real-ip", 80)
        .or_else(|| forwarded_ip(headers))
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn real_ip_set_by_gateway_wins_over_spoofable_forwarded_for() {
        let mut headers = HeaderMap::new();
        headers.insert("x-forwarded-for", "1.2.3.4, 203.0.113.5".parse().unwrap());
        headers.insert("x-real-ip", "203.0.113.5".parse().unwrap());
        assert_eq!(from_headers(&headers).ip, "203.0.113.5");

        let mut only_forwarded = HeaderMap::new();
        only_forwarded.insert("x-forwarded-for", "198.51.100.1".parse().unwrap());
        assert_eq!(from_headers(&only_forwarded).ip, "198.51.100.1");
    }
}
