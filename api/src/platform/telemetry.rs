use tracing_subscriber::{EnvFilter, fmt};

pub fn init(log_level: &str) {
    let filter = EnvFilter::try_from_default_env()
        .or_else(|_| EnvFilter::try_new(log_level))
        .unwrap_or_else(|_| EnvFilter::new("info"));

    let _ = fmt().with_env_filter(filter).try_init();
}

#[cfg(test)]
mod tests {
    use crate::platform::telemetry;

    #[test]
    fn init_is_idempotent_and_tolerates_invalid_filter() {
        telemetry::init("off");
        telemetry::init("not a valid env filter");
    }
}
