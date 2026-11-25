//! 进程内失败次数限流：用于登录与受保护资料解锁，抵御在线暴力猜测。
//!
//! 只统计失败；成功后清除对应键。单实例部署（SQLite 单体），无需跨进程共享。

use std::{
    collections::HashMap,
    sync::Mutex,
    time::{Duration, Instant},
};

/// 条目超过该数量时清理已过期窗口，避免被大量随机键撑大内存。
const PRUNE_THRESHOLD: usize = 10_000;

#[derive(Debug)]
pub struct FailureLimiter {
    max_failures: u32,
    window: Duration,
    entries: Mutex<HashMap<String, (Instant, u32)>>,
}

impl FailureLimiter {
    pub fn new(max_failures: u32, window: Duration) -> Self {
        Self {
            max_failures,
            window,
            entries: Mutex::new(HashMap::new()),
        }
    }

    /// 已达到失败上限时返回剩余等待时间。
    pub fn check(&self, key: &str) -> Result<(), Duration> {
        let now = Instant::now();
        let entries = self
            .entries
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        match entries.get(key) {
            Some((started, count))
                if now.duration_since(*started) < self.window && *count >= self.max_failures =>
            {
                Err(self.window - now.duration_since(*started))
            }
            _ => Ok(()),
        }
    }

    /// 原子地检查并登记一次尝试：未达上限时立即计数并放行，达到上限时返回剩余等待时间。
    /// 校验前先计数，避免并发请求都在计数为 0 时通过检查、绕过上限；校验成功后调用 `undo` 或 `reset`。
    pub fn begin_attempt(&self, key: &str) -> Result<(), Duration> {
        let now = Instant::now();
        let mut entries = self
            .entries
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        if entries.len() >= PRUNE_THRESHOLD {
            let window = self.window;
            entries.retain(|_, (started, _)| now.duration_since(*started) < window);
        }
        let entry = entries.entry(key.to_string()).or_insert((now, 0));
        if now.duration_since(entry.0) >= self.window {
            *entry = (now, 0);
        }
        if entry.1 >= self.max_failures {
            return Err(self.window - now.duration_since(entry.0));
        }
        entry.1 += 1;
        Ok(())
    }

    /// 撤销一次由 `begin_attempt` 登记、最终成功的尝试。
    pub fn undo_attempt(&self, key: &str) {
        let mut entries = self
            .entries
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        if let Some(entry) = entries.get_mut(key) {
            entry.1 = entry.1.saturating_sub(1);
        }
    }

    pub fn record_failure(&self, key: &str) {
        let now = Instant::now();
        let mut entries = self
            .entries
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        if entries.len() >= PRUNE_THRESHOLD {
            let window = self.window;
            entries.retain(|_, (started, _)| now.duration_since(*started) < window);
        }
        let entry = entries.entry(key.to_string()).or_insert((now, 0));
        if now.duration_since(entry.0) >= self.window {
            *entry = (now, 0);
        }
        entry.1 = entry.1.saturating_add(1);
    }

    pub fn reset(&self, key: &str) {
        let mut entries = self
            .entries
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        entries.remove(key);
    }
}

/// 登录与资料解锁使用的限流器集合，随 `AppState` 创建（测试之间互不影响）。
#[derive(Debug)]
pub struct AuthRateLimits {
    /// 同一用户名：15 分钟内失败 10 次后暂停登录。
    pub login_by_username: FailureLimiter,
    /// 同一来源 IP：15 分钟内失败 50 次后暂停（IP 来自代理头，仅作辅助维度）。
    pub login_by_ip: FailureLimiter,
    /// 同一用户对同一资料：15 分钟内失败 10 次后暂停解锁。
    pub resource_unlock: FailureLimiter,
}

impl Default for AuthRateLimits {
    fn default() -> Self {
        let window = Duration::from_secs(15 * 60);
        Self {
            login_by_username: FailureLimiter::new(10, window),
            login_by_ip: FailureLimiter::new(50, window),
            resource_unlock: FailureLimiter::new(10, window),
        }
    }
}

/// 对外提示的等待分钟数（向上取整，至少 1 分钟）。
pub fn retry_after_minutes(wait: Duration) -> u64 {
    wait.as_secs().div_ceil(60).max(1)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn blocks_after_max_failures_and_resets_on_success() {
        let limiter = FailureLimiter::new(3, Duration::from_secs(60));
        for _ in 0..3 {
            assert!(limiter.check("alice").is_ok());
            limiter.record_failure("alice");
        }
        assert!(limiter.check("alice").is_err());
        assert!(limiter.check("bob").is_ok());
        limiter.reset("alice");
        assert!(limiter.check("alice").is_ok());
    }

    #[test]
    fn begin_attempt_counts_before_verification_so_bursts_cannot_bypass_the_limit() {
        let limiter = FailureLimiter::new(3, Duration::from_secs(60));
        // 并发突发：在任何校验完成前连续登记，第 4 次即被拒绝。
        assert!(limiter.begin_attempt("k").is_ok());
        assert!(limiter.begin_attempt("k").is_ok());
        assert!(limiter.begin_attempt("k").is_ok());
        assert!(limiter.begin_attempt("k").is_err());
        // 成功的尝试撤销计数。
        limiter.undo_attempt("k");
        assert!(limiter.begin_attempt("k").is_ok());
    }

    #[test]
    fn window_expiry_restarts_counting() {
        let limiter = FailureLimiter::new(1, Duration::from_millis(20));
        limiter.record_failure("k");
        assert!(limiter.check("k").is_err());
        std::thread::sleep(Duration::from_millis(30));
        assert!(limiter.check("k").is_ok());
    }
}
