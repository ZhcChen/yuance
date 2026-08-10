use napi::{Env, Error, Result, Status, Task, bindgen_prelude::AsyncTask};
use napi_derive::napi;
use std::path::{Component, Path};

const MAX_CAPTURE_BYTES: u64 = 100 * 1024 * 1024;

#[napi(object)]
pub struct CaptureWindowsFileInput {
    pub source_path: String,
    pub spool_root: String,
    pub nonce: String,
    pub max_bytes: i64,
}

#[napi(object)]
#[derive(Debug)]
pub struct CaptureWindowsFileResult {
    pub private_path: String,
    pub byte_size: i64,
    pub sha256: String,
}

#[napi(object)]
pub struct CommitWindowsDownloadInput {
    pub directory: String,
    pub target_path: String,
    pub temporary_path: String,
    pub parent_fd: i32,
    pub temporary_fd: i32,
    pub target_fd: i32,
}

#[derive(Debug, PartialEq, Eq)]
struct ValidatedInput {
    source_path: String,
    spool_root: String,
    nonce: String,
    max_bytes: u64,
}

fn stable_error(code: &'static str) -> Error {
    Error::new(Status::GenericFailure, code)
}

fn validate_capture_input(input: CaptureWindowsFileInput) -> Result<ValidatedInput> {
    if !is_absolute_normal_path(&input.source_path) || input.source_path.contains('\0') {
        return Err(stable_error("ERR_FILE_GUARD_SOURCE_INVALID"));
    }
    if !is_absolute_normal_path(&input.spool_root) || input.spool_root.contains('\0') {
        return Err(stable_error("ERR_FILE_GUARD_SPOOL_INVALID"));
    }
    if !(16..=128).contains(&input.nonce.len())
        || !input
            .nonce
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
    {
        return Err(stable_error("ERR_FILE_GUARD_NONCE_INVALID"));
    }
    let max_bytes = u64::try_from(input.max_bytes)
        .ok()
        .filter(|value| (1..=MAX_CAPTURE_BYTES).contains(value))
        .ok_or_else(|| stable_error("ERR_FILE_GUARD_LIMIT_INVALID"))?;

    Ok(ValidatedInput {
        source_path: input.source_path,
        spool_root: input.spool_root,
        nonce: input.nonce,
        max_bytes,
    })
}

fn is_absolute_normal_path(value: &str) -> bool {
    let path = Path::new(value);
    path.is_absolute()
        && path
            .components()
            .all(|component| !matches!(component, Component::ParentDir | Component::CurDir))
}

#[napi(js_name = "captureWindowsFile")]
pub fn capture_windows_file(input: CaptureWindowsFileInput) -> Result<AsyncTask<CaptureTask>> {
    let input = validate_capture_input(input)?;
    Ok(AsyncTask::new(CaptureTask(Some(input))))
}

#[napi(js_name = "secureWindowsSpoolRoot")]
pub fn secure_windows_spool_root(spool_root: String) -> Result<AsyncTask<SecureSpoolTask>> {
    if !is_absolute_normal_path(&spool_root) || spool_root.contains('\0') {
        return Err(stable_error("ERR_FILE_GUARD_SPOOL_INVALID"));
    }
    Ok(AsyncTask::new(SecureSpoolTask(spool_root)))
}

#[napi(js_name = "secureWindowsPrivateDirectory")]
pub fn secure_windows_private_directory(
    directory: String,
) -> Result<AsyncTask<SecureDirectoryTask>> {
    if !is_absolute_normal_path(&directory) || directory.contains('\0') {
        return Err(stable_error("ERR_FILE_GUARD_DIRECTORY_INVALID"));
    }
    Ok(AsyncTask::new(SecureDirectoryTask(directory)))
}

#[napi(js_name = "cleanupWindowsSpool")]
pub fn cleanup_windows_spool(spool_root: String) -> Result<AsyncTask<CleanupSpoolTask>> {
    validate_spool_root(&spool_root)?;
    Ok(AsyncTask::new(CleanupSpoolTask(spool_root)))
}

#[napi(js_name = "removeWindowsSnapshot")]
pub fn remove_windows_snapshot(
    spool_root: String,
    private_path: String,
) -> Result<AsyncTask<RemoveSnapshotTask>> {
    validate_spool_root(&spool_root)?;
    if !is_absolute_normal_path(&private_path) || private_path.contains('\0') {
        return Err(stable_error("ERR_FILE_GUARD_SNAPSHOT_INVALID"));
    }
    Ok(AsyncTask::new(RemoveSnapshotTask {
        spool_root,
        private_path,
    }))
}

#[napi(js_name = "verifyWindowsSnapshotHandle")]
pub fn verify_windows_snapshot_handle(
    spool_root: String,
    private_path: String,
    fd: i32,
) -> Result<AsyncTask<VerifySnapshotTask>> {
    validate_spool_root(&spool_root)?;
    if !is_absolute_normal_path(&private_path) || private_path.contains('\0') || fd < 0 {
        return Err(stable_error("ERR_FILE_GUARD_SNAPSHOT_INVALID"));
    }
    Ok(AsyncTask::new(VerifySnapshotTask {
        spool_root,
        private_path,
        fd,
    }))
}

#[napi(js_name = "commitWindowsDownload")]
pub fn commit_windows_download(
    input: CommitWindowsDownloadInput,
) -> Result<AsyncTask<CommitDownloadTask>> {
    for value in [&input.directory, &input.target_path, &input.temporary_path] {
        if !is_absolute_normal_path(value) || value.contains('\0') {
            return Err(stable_error("ERR_FILE_GUARD_DOWNLOAD_INVALID"));
        }
    }
    if input.parent_fd < 0 || input.temporary_fd < 0 || input.target_fd < -1 {
        return Err(stable_error("ERR_FILE_GUARD_DOWNLOAD_INVALID"));
    }
    Ok(AsyncTask::new(CommitDownloadTask(input)))
}

pub struct CaptureTask(Option<ValidatedInput>);
impl Task for CaptureTask {
    type Output = CaptureWindowsFileResult;
    type JsValue = CaptureWindowsFileResult;
    fn compute(&mut self) -> Result<Self::Output> {
        platform::capture(
            self.0
                .take()
                .ok_or_else(|| stable_error("ERR_FILE_GUARD_TASK_REUSED"))?,
        )
    }
    fn resolve(&mut self, _env: Env, output: Self::Output) -> Result<Self::JsValue> {
        Ok(output)
    }
}

pub struct SecureSpoolTask(String);
impl Task for SecureSpoolTask {
    type Output = ();
    type JsValue = ();
    fn compute(&mut self) -> Result<Self::Output> {
        platform::secure_spool_root(&self.0)
    }
    fn resolve(&mut self, _env: Env, output: Self::Output) -> Result<Self::JsValue> {
        Ok(output)
    }
}

pub struct SecureDirectoryTask(String);
impl Task for SecureDirectoryTask {
    type Output = ();
    type JsValue = ();
    fn compute(&mut self) -> Result<Self::Output> {
        platform::secure_private_directory(&self.0)
    }
    fn resolve(&mut self, _env: Env, output: Self::Output) -> Result<Self::JsValue> {
        Ok(output)
    }
}

pub struct CleanupSpoolTask(String);
impl Task for CleanupSpoolTask {
    type Output = u32;
    type JsValue = u32;
    fn compute(&mut self) -> Result<Self::Output> {
        platform::cleanup_spool(&self.0)
    }
    fn resolve(&mut self, _env: Env, output: Self::Output) -> Result<Self::JsValue> {
        Ok(output)
    }
}

pub struct RemoveSnapshotTask {
    spool_root: String,
    private_path: String,
}
impl Task for RemoveSnapshotTask {
    type Output = ();
    type JsValue = ();
    fn compute(&mut self) -> Result<Self::Output> {
        platform::remove_snapshot(&self.spool_root, &self.private_path)
    }
    fn resolve(&mut self, _env: Env, output: Self::Output) -> Result<Self::JsValue> {
        Ok(output)
    }
}

pub struct VerifySnapshotTask {
    spool_root: String,
    private_path: String,
    fd: i32,
}
impl Task for VerifySnapshotTask {
    type Output = ();
    type JsValue = ();
    fn compute(&mut self) -> Result<Self::Output> {
        platform::verify_snapshot_handle(&self.spool_root, &self.private_path, self.fd)
    }
    fn resolve(&mut self, _env: Env, output: Self::Output) -> Result<Self::JsValue> {
        Ok(output)
    }
}

pub struct CommitDownloadTask(CommitWindowsDownloadInput);
impl Task for CommitDownloadTask {
    type Output = ();
    type JsValue = ();
    fn compute(&mut self) -> Result<Self::Output> {
        platform::commit_download(&self.0)
    }
    fn resolve(&mut self, _env: Env, output: Self::Output) -> Result<Self::JsValue> {
        Ok(output)
    }
}

fn validate_spool_root(spool_root: &str) -> Result<()> {
    if !is_absolute_normal_path(spool_root) || spool_root.contains('\0') {
        return Err(stable_error("ERR_FILE_GUARD_SPOOL_INVALID"));
    }
    Ok(())
}

#[cfg(not(windows))]
mod platform {
    use super::*;

    pub(super) fn capture(_input: ValidatedInput) -> Result<CaptureWindowsFileResult> {
        Err(stable_error("ERR_FILE_GUARD_WINDOWS_REQUIRED"))
    }

    pub(super) fn secure_spool_root(_spool_root: &str) -> Result<()> {
        Err(stable_error("ERR_FILE_GUARD_WINDOWS_REQUIRED"))
    }

    pub(super) fn secure_private_directory(_directory: &str) -> Result<()> {
        Err(stable_error("ERR_FILE_GUARD_WINDOWS_REQUIRED"))
    }

    pub(super) fn cleanup_spool(_spool_root: &str) -> Result<u32> {
        Err(stable_error("ERR_FILE_GUARD_WINDOWS_REQUIRED"))
    }

    pub(super) fn remove_snapshot(_spool_root: &str, _private_path: &str) -> Result<()> {
        Err(stable_error("ERR_FILE_GUARD_WINDOWS_REQUIRED"))
    }

    pub(super) fn verify_snapshot_handle(
        _spool_root: &str,
        _private_path: &str,
        _fd: i32,
    ) -> Result<()> {
        Err(stable_error("ERR_FILE_GUARD_WINDOWS_REQUIRED"))
    }

    pub(super) fn commit_download(_input: &CommitWindowsDownloadInput) -> Result<()> {
        Err(stable_error("ERR_FILE_GUARD_WINDOWS_REQUIRED"))
    }
}

#[cfg(windows)]
mod platform;

#[cfg(test)]
mod tests {
    use super::*;

    fn valid_input() -> CaptureWindowsFileInput {
        CaptureWindowsFileInput {
            source_path: if cfg!(windows) {
                r"C:\source\file.txt".into()
            } else {
                "/source/file.txt".into()
            },
            spool_root: if cfg!(windows) {
                r"C:\spool".into()
            } else {
                "/spool".into()
            },
            nonce: "0123456789abcdef".into(),
            max_bytes: 1024,
        }
    }

    #[test]
    fn accepts_bounded_absolute_input() {
        let value = validate_capture_input(valid_input()).expect("valid input");
        assert_eq!(value.max_bytes, 1024);
    }

    #[test]
    fn rejects_invalid_limits() {
        for max_bytes in [-1, 0, MAX_CAPTURE_BYTES as i64 + 1] {
            let mut input = valid_input();
            input.max_bytes = max_bytes;
            assert_eq!(
                validate_capture_input(input).unwrap_err().reason,
                "ERR_FILE_GUARD_LIMIT_INVALID"
            );
        }
    }

    #[test]
    fn rejects_traversal_relative_and_unsafe_nonce() {
        let mut relative = valid_input();
        relative.source_path = "relative/file.txt".into();
        assert!(validate_capture_input(relative).is_err());

        let mut traversal = valid_input();
        traversal.spool_root = if cfg!(windows) {
            r"C:\spool\..\elsewhere".into()
        } else {
            "/spool/../elsewhere".into()
        };
        assert!(validate_capture_input(traversal).is_err());

        let mut nonce = valid_input();
        nonce.nonce = "../../unsafe-value".into();
        assert_eq!(
            validate_capture_input(nonce).unwrap_err().reason,
            "ERR_FILE_GUARD_NONCE_INVALID"
        );
    }
}
