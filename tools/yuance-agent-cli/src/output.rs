use serde::Serialize;
use serde_json::Value;

use crate::error::AgentError;

pub fn write_success(value: &Value, pretty: bool) {
    write_json(std::io::stdout(), value, pretty);
}

pub fn write_error(error: &AgentError, pretty: bool) {
    write_json(std::io::stderr(), &error.envelope(), pretty);
}

fn write_json(mut writer: impl std::io::Write, value: &impl Serialize, pretty: bool) {
    let result = if pretty {
        serde_json::to_writer_pretty(&mut writer, value)
    } else {
        serde_json::to_writer(&mut writer, value)
    };

    if result.is_ok() {
        let _ = writeln!(writer);
    }
}
