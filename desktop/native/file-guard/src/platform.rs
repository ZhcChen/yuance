use super::*;
use sha2::{Digest, Sha256};
use std::ffi::c_void;
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::mem::{size_of, zeroed};
use std::os::windows::fs::OpenOptionsExt;
use std::os::windows::io::{AsRawHandle, FromRawHandle};
use std::path::{Path, PathBuf};
use std::ptr::{null, null_mut};
use windows_sys::Win32::Foundation::{
    CloseHandle, DUPLICATE_SAME_ACCESS, DuplicateHandle, ERROR_SUCCESS, GENERIC_READ,
    GENERIC_WRITE, HANDLE,
};
use windows_sys::Win32::Security::Authorization::{SE_FILE_OBJECT, SetSecurityInfo};
use windows_sys::Win32::Security::{
    ACL, ACL_REVISION, AddAccessAllowedAceEx, CONTAINER_INHERIT_ACE, CreateWellKnownSid,
    DACL_SECURITY_INFORMATION, GetLengthSid, GetTokenInformation, InitializeAcl,
    OBJECT_INHERIT_ACE, PROTECTED_DACL_SECURITY_INFORMATION, PSID, TOKEN_QUERY, TOKEN_USER,
    TokenUser, WinLocalSystemSid,
};
use windows_sys::Win32::Storage::FileSystem::{
    DELETE, FILE_ALL_ACCESS, FILE_ATTRIBUTE_REPARSE_POINT, FILE_ATTRIBUTE_TAG_INFO,
    FILE_BASIC_INFO, FILE_DISPOSITION_INFO, FILE_FLAG_BACKUP_SEMANTICS,
    FILE_FLAG_OPEN_REPARSE_POINT, FILE_FLAG_SEQUENTIAL_SCAN, FILE_ID_INFO, FILE_NAME_NORMALIZED,
    FILE_SHARE_DELETE, FILE_SHARE_READ, FILE_SHARE_WRITE, FILE_STANDARD_INFO, FileAttributeTagInfo,
    FileBasicInfo, FileDispositionInfo, FileIdInfo, FileStandardInfo, FlushFileBuffers,
    GetFileInformationByHandleEx, GetFinalPathNameByHandleW, SetFileInformationByHandle,
    VOLUME_NAME_DOS, WRITE_DAC,
};
use windows_sys::Win32::System::Threading::{GetCurrentProcess, OpenProcessToken};

unsafe extern "C" {
    fn _get_osfhandle(fd: i32) -> isize;
}

#[link(name = "ntdll")]
unsafe extern "system" {
    fn NtSetInformationFile(
        file_handle: HANDLE,
        io_status_block: *mut NtIoStatusBlock,
        file_information: *const c_void,
        length: u32,
        file_information_class: i32,
    ) -> i32;
}

const STAGING_PREFIX: &str = ".yuance-staging-";
const STAGING_SUFFIX: &str = ".tmp";
const SNAPSHOT_PREFIX: &str = "yuance-snapshot-";
const SNAPSHOT_SUFFIX: &str = ".bin";
const MARKER_NAME: &str = ".yuance-file-spool-v1";
const MARKER_CONTENT: &[u8] = b"yuance-file-spool-v1\n";
const DOWNLOAD_PREFIX: &str = ".yuance-download-";
const DOWNLOAD_SUFFIX: &str = ".tmp";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct Identity {
    volume: u64,
    file_id: [u8; 16],
    size: i64,
    last_write: i64,
    change_time: i64,
}

#[repr(C)]
struct NtIoStatusBlock {
    status_or_pointer: usize,
    information: usize,
}

#[repr(C)]
struct NtFileRenameInformation {
    replace_if_exists: u32,
    root_directory: HANDLE,
    file_name_length: u32,
    file_name: [u16; 1],
}

const FILE_RENAME_INFORMATION_CLASS: i32 = 10;

pub(super) fn secure_spool_root(spool_root: &str) -> Result<()> {
    validate_windows_path(Path::new(spool_root), "ERR_FILE_GUARD_SPOOL_INVALID")?;
    let path = Path::new(spool_root);
    let created = match fs::create_dir(path) {
        Ok(()) => true,
        Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => false,
        Err(_) => return Err(stable_error("ERR_FILE_GUARD_SPOOL_CREATE")),
    };

    let mut created_identity = None;
    let result = (|| {
        let root_chain = open_verified_directory_chain(path)?;
        let root = root_chain
            .last()
            .ok_or_else(|| stable_error("ERR_FILE_GUARD_DIRECTORY_OPEN"))?;
        verify_not_reparse(root)?;
        if created {
            created_identity = Some(identity(root)?);
        } else {
            ensure_spool_marker(path, root, false)?;
        }
        let acl_root = open_directory_for_acl(path)?;
        verify_not_reparse(&acl_root)?;
        if !same_file_object(identity(root)?, identity(&acl_root)?) {
            return Err(stable_error("ERR_FILE_GUARD_SPOOL_CHANGED"));
        }
        apply_private_dacl(&acl_root)?;
        // Reopen after changing security so replacement during ACL application is detected.
        let verified_chain = open_verified_directory_chain(path)?;
        let verified = verified_chain
            .last()
            .ok_or_else(|| stable_error("ERR_FILE_GUARD_DIRECTORY_OPEN"))?;
        if !same_file_object(identity(root)?, identity(verified)?) {
            return Err(stable_error("ERR_FILE_GUARD_SPOOL_CHANGED"));
        }
        if created {
            ensure_spool_marker(path, verified, true)?;
        }
        Ok(())
    })();
    if result.is_err() && created {
        if let Some(expected) = created_identity {
            rollback_created_spool(path, expected);
        }
    }
    result
}

fn rollback_created_spool(path: &Path, expected: Identity) {
    let Ok(chain) = open_verified_directory_chain(path) else {
        return;
    };
    let Some(root) = chain.last() else { return };
    if !identity(root).is_ok_and(|current| same_file_object(current, expected)) {
        return;
    }
    let marker_path = path.join(MARKER_NAME);
    if let Ok(marker) = open_file_for_delete(&marker_path) {
        if verify_regular(&marker).is_err()
            || ensure_handle_within_root(&marker, root).is_err()
            || delete_by_handle(&marker).is_err()
        {
            return;
        }
    }
    let Ok(directory) = open_directory_for_delete(path) else {
        return;
    };
    if identity(&directory).is_ok_and(|current| same_file_object(current, expected)) {
        let _ = delete_by_handle(&directory);
    }
}

fn ensure_spool_marker(root_path: &Path, root: &File, created: bool) -> Result<()> {
    let marker_path = root_path.join(MARKER_NAME);
    if created {
        let mut marker = open_file_no_reparse(&marker_path, true)?;
        ensure_handle_within_root(&marker, root)?;
        write_all_checked(&mut marker, MARKER_CONTENT)?;
        marker
            .flush()
            .map_err(|_| stable_error("ERR_FILE_GUARD_MARKER"))?;
        if unsafe { FlushFileBuffers(marker.as_raw_handle() as HANDLE) } == 0 {
            return Err(stable_error("ERR_FILE_GUARD_MARKER"));
        }
        return Ok(());
    }
    let marker = open_file_no_reparse(&marker_path, false)
        .map_err(|_| stable_error("ERR_FILE_GUARD_MARKER"))?;
    verify_regular(&marker)?;
    ensure_handle_within_root(&marker, root)?;
    let mut contents = Vec::with_capacity(MARKER_CONTENT.len() + 1);
    marker
        .take((MARKER_CONTENT.len() + 1) as u64)
        .read_to_end(&mut contents)
        .map_err(|_| stable_error("ERR_FILE_GUARD_MARKER"))?;
    if contents != MARKER_CONTENT {
        return Err(stable_error("ERR_FILE_GUARD_MARKER"));
    }
    Ok(())
}

pub(super) fn capture(input: ValidatedInput) -> Result<CaptureWindowsFileResult> {
    validate_windows_path(
        Path::new(&input.source_path),
        "ERR_FILE_GUARD_SOURCE_INVALID",
    )?;
    validate_windows_path(Path::new(&input.spool_root), "ERR_FILE_GUARD_SPOOL_INVALID")?;
    secure_spool_root(&input.spool_root)?;
    let source_path = Path::new(&input.source_path);
    let spool_root = Path::new(&input.spool_root);
    let trusted_root_chain = open_verified_directory_chain(spool_root)?;
    let trusted_root = trusted_root_chain
        .last()
        .ok_or_else(|| stable_error("ERR_FILE_GUARD_DIRECTORY_OPEN"))?;
    let trusted_root_identity = identity(trusted_root)?;
    let trusted_root_final = final_path(trusted_root)?;
    let source_parent_chain = open_verified_directory_chain(
        source_path
            .parent()
            .ok_or_else(|| stable_error("ERR_FILE_GUARD_SOURCE_INVALID"))?,
    )?;
    let source_parent = source_parent_chain
        .last()
        .ok_or_else(|| stable_error("ERR_FILE_GUARD_DIRECTORY_OPEN"))?;

    let mut source = open_file_no_reparse(source_path, false)?;
    verify_regular(&source)?;
    ensure_direct_child(&source, source_parent)?;
    let before = identity(&source)?;
    if before.size < 0 || before.size as u64 > input.max_bytes {
        return Err(stable_error("ERR_FILE_GUARD_LIMIT_EXCEEDED"));
    }
    let source_final = final_path(&source)?;

    let staging = spool_root.join(format!("{STAGING_PREFIX}{}{STAGING_SUFFIX}", input.nonce));
    let committed = spool_root.join(format!("{SNAPSHOT_PREFIX}{}{SNAPSHOT_SUFFIX}", input.nonce));
    let mut staging_guard = DeleteOnDrop::new(staging.clone());
    let mut destination = open_file_no_reparse(&staging, true)?;
    verify_regular(&destination)?;
    ensure_handle_within_root(&destination, trusted_root)?;

    let mut hash = Sha256::new();
    let mut byte_size = 0_u64;
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let read = source
            .read(&mut buffer)
            .map_err(|_| stable_error("ERR_FILE_GUARD_SOURCE_READ"))?;
        if read == 0 {
            break;
        }
        byte_size = byte_size
            .checked_add(read as u64)
            .filter(|value| *value <= input.max_bytes)
            .ok_or_else(|| stable_error("ERR_FILE_GUARD_LIMIT_EXCEEDED"))?;
        hash.update(&buffer[..read]);
        write_all_checked(&mut destination, &buffer[..read])?;
    }
    destination
        .flush()
        .map_err(|_| stable_error("ERR_FILE_GUARD_SNAPSHOT_WRITE"))?;
    if unsafe { FlushFileBuffers(destination.as_raw_handle() as HANDLE) } == 0 {
        return Err(stable_error("ERR_FILE_GUARD_SNAPSHOT_SYNC"));
    }
    let destination_identity = identity(&destination)?;
    if destination_identity.size < 0 || destination_identity.size as u64 != byte_size {
        return Err(stable_error("ERR_FILE_GUARD_SNAPSHOT_SIZE"));
    }
    ensure_handle_within_root(&destination, &trusted_root)?;

    let after = identity(&source)?;
    if before != after || byte_size != before.size as u64 || final_path(&source)? != source_final {
        return Err(stable_error("ERR_FILE_GUARD_SOURCE_CHANGED"));
    }
    let path_identity = open_file_no_reparse(source_path, false)?;
    if identity(&path_identity)? != before
        || final_path(&path_identity)? != source_final
        || ensure_direct_child(&path_identity, source_parent).is_err()
    {
        return Err(stable_error("ERR_FILE_GUARD_SOURCE_CHANGED"));
    }
    verify_components_no_reparse(source_path, false)?;
    verify_components_no_reparse(spool_root, true)?;
    let root_recheck_chain = open_verified_directory_chain(spool_root)?;
    let root_recheck = root_recheck_chain
        .last()
        .ok_or_else(|| stable_error("ERR_FILE_GUARD_DIRECTORY_OPEN"))?;
    if !same_file_object(identity(&root_recheck)?, trusted_root_identity)
        || final_path(&root_recheck)? != trusted_root_final
    {
        return Err(stable_error("ERR_FILE_GUARD_SPOOL_CHANGED"));
    }

    let mutation_root = open_directory_for_mutation(spool_root)?;
    verify_not_reparse(&mutation_root)?;
    if !same_file_object(identity(&mutation_root)?, trusted_root_identity)
        || final_path(&mutation_root)? != trusted_root_final
    {
        return Err(stable_error("ERR_FILE_GUARD_SPOOL_CHANGED"));
    }
    atomic_commit(
        &destination,
        &mutation_root,
        committed
            .file_name()
            .ok_or_else(|| stable_error("ERR_FILE_GUARD_SNAPSHOT_COMMIT"))?,
    )?;
    staging_guard.disarm();
    ensure_handle_within_root(&destination, trusted_root)?;
    let committed_handle = open_file_no_reparse(&committed, false)?;
    verify_regular(&committed_handle)?;
    ensure_direct_child(&committed_handle, trusted_root)?;
    let committed_identity = identity(&committed_handle)?;
    if !same_file_object(committed_identity, identity(&destination)?) {
        let _ = delete_by_handle(&destination);
        return Err(stable_error("ERR_FILE_GUARD_SNAPSHOT_IDENTITY"));
    }
    if committed_identity.size < 0 || committed_identity.size as u64 != byte_size {
        let _ = delete_by_handle(&destination);
        return Err(stable_error("ERR_FILE_GUARD_SNAPSHOT_SIZE"));
    }

    Ok(CaptureWindowsFileResult {
        private_path: committed.to_string_lossy().into_owned(),
        byte_size: byte_size as i64,
        sha256: format!("{:x}", hash.finalize()),
    })
}

pub(super) fn cleanup_spool(spool_root: &str) -> Result<u32> {
    secure_spool_root(spool_root)?;
    let root = Path::new(spool_root);
    let root_chain = open_verified_directory_chain(root)?;
    let root_handle = root_chain
        .last()
        .ok_or_else(|| stable_error("ERR_FILE_GUARD_DIRECTORY_OPEN"))?;
    let mut removed = 0_u32;
    let entries = fs::read_dir(root).map_err(|_| stable_error("ERR_FILE_GUARD_CLEANUP"))?;
    for entry in entries {
        let entry = entry.map_err(|_| stable_error("ERR_FILE_GUARD_CLEANUP"))?;
        let name = entry.file_name();
        let Some(name) = name.to_str() else { continue };
        if !is_owned_name(name) {
            continue;
        }
        remove_owned_file(root_handle, &entry.path())?;
        removed = removed
            .checked_add(1)
            .ok_or_else(|| stable_error("ERR_FILE_GUARD_CLEANUP"))?;
    }
    Ok(removed)
}

pub(super) fn remove_snapshot(spool_root: &str, private_path: &str) -> Result<()> {
    secure_spool_root(spool_root)?;
    let root = Path::new(spool_root);
    let root_chain = open_verified_directory_chain(root)?;
    let root_handle = root_chain
        .last()
        .ok_or_else(|| stable_error("ERR_FILE_GUARD_DIRECTORY_OPEN"))?;
    let path = Path::new(private_path);
    let name = path
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| stable_error("ERR_FILE_GUARD_SNAPSHOT_INVALID"))?;
    if !is_snapshot_name(name) {
        return Err(stable_error("ERR_FILE_GUARD_SNAPSHOT_INVALID"));
    }
    remove_owned_file(root_handle, path)
}

pub(super) fn verify_snapshot_handle(spool_root: &str, private_path: &str, fd: i32) -> Result<()> {
    secure_spool_root(spool_root)?;
    let root_path = Path::new(spool_root);
    let private_path = Path::new(private_path);
    let name = private_path
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| stable_error("ERR_FILE_GUARD_SNAPSHOT_INVALID"))?;
    if !is_snapshot_name(name) {
        return Err(stable_error("ERR_FILE_GUARD_SNAPSHOT_INVALID"));
    }
    let root_chain = open_verified_directory_chain(root_path)?;
    let root = root_chain
        .last()
        .ok_or_else(|| stable_error("ERR_FILE_GUARD_DIRECTORY_OPEN"))?;
    let raw = unsafe { _get_osfhandle(fd) };
    if raw == -1 {
        return Err(stable_error("ERR_FILE_GUARD_SNAPSHOT_INVALID"));
    }
    let process = unsafe { GetCurrentProcess() };
    let mut duplicated: HANDLE = null_mut();
    if unsafe {
        DuplicateHandle(
            process,
            raw as HANDLE,
            process,
            &mut duplicated,
            0,
            0,
            DUPLICATE_SAME_ACCESS,
        )
    } == 0
    {
        return Err(stable_error("ERR_FILE_GUARD_SNAPSHOT_INVALID"));
    }
    let opened = unsafe { File::from_raw_handle(duplicated as _) };
    verify_regular(&opened)?;
    ensure_handle_within_root(&opened, root)?;
    if final_path(&opened)? != normalize_final_path(&private_path.to_string_lossy()) {
        return Err(stable_error("ERR_FILE_GUARD_SNAPSHOT_CHANGED"));
    }
    let path_handle = open_file_no_reparse(private_path, false)?;
    if identity(&path_handle)? != identity(&opened)?
        || final_path(&path_handle)? != final_path(&opened)?
    {
        return Err(stable_error("ERR_FILE_GUARD_SNAPSHOT_CHANGED"));
    }
    Ok(())
}

pub(super) fn commit_download(input: &CommitWindowsDownloadInput) -> Result<()> {
    let directory = Path::new(&input.directory);
    let target_path = Path::new(&input.target_path);
    let temporary_path = Path::new(&input.temporary_path);
    validate_windows_path(directory, "ERR_FILE_GUARD_DOWNLOAD_INVALID")?;
    validate_windows_path(target_path, "ERR_FILE_GUARD_DOWNLOAD_INVALID")?;
    validate_windows_path(temporary_path, "ERR_FILE_GUARD_DOWNLOAD_INVALID")?;
    if target_path.parent() != Some(directory) || temporary_path.parent() != Some(directory) {
        return Err(stable_error("ERR_FILE_GUARD_DOWNLOAD_INVALID"));
    }
    let temporary_name = temporary_path
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| stable_error("ERR_FILE_GUARD_DOWNLOAD_INVALID"))?;
    if !has_safe_nonce(temporary_name, DOWNLOAD_PREFIX, DOWNLOAD_SUFFIX) {
        return Err(stable_error("ERR_FILE_GUARD_DOWNLOAD_INVALID"));
    }
    let target_name = target_path
        .file_name()
        .filter(|value| !value.is_empty())
        .ok_or_else(|| stable_error("ERR_FILE_GUARD_DOWNLOAD_INVALID"))?;

    let parent = duplicate_fd(input.parent_fd, "ERR_FILE_GUARD_DOWNLOAD_CHANGED")?;
    verify_not_reparse(&parent)?;
    let parent_info: FILE_STANDARD_INFO = file_info(&parent, FileStandardInfo)?;
    if parent_info.Directory == 0 || final_path(&parent)? != normalize_final_path(&input.directory)
    {
        return Err(stable_error("ERR_FILE_GUARD_DOWNLOAD_CHANGED"));
    }

    let temporary = duplicate_fd(input.temporary_fd, "ERR_FILE_GUARD_DOWNLOAD_CHANGED")?;
    verify_regular(&temporary)?;
    ensure_direct_child(&temporary, &parent)?;
    if final_path(&temporary)? != normalize_final_path(&input.temporary_path) {
        return Err(stable_error("ERR_FILE_GUARD_DOWNLOAD_CHANGED"));
    }
    let reopened_temporary = open_file_for_delete(temporary_path)?;
    if identity(&reopened_temporary)? != identity(&temporary)? {
        return Err(stable_error("ERR_FILE_GUARD_DOWNLOAD_CHANGED"));
    }

    let replace = input.target_fd >= 0;
    if replace {
        let target = duplicate_fd(input.target_fd, "ERR_FILE_GUARD_DOWNLOAD_CHANGED")?;
        verify_regular(&target)?;
        ensure_direct_child(&target, &parent)?;
        if final_path(&target)? != normalize_final_path(&input.target_path) {
            return Err(stable_error("ERR_FILE_GUARD_DOWNLOAD_CHANGED"));
        }
        let reopened_target = open_file_no_reparse(target_path, false)?;
        if identity(&reopened_target)? != identity(&target)? {
            return Err(stable_error("ERR_FILE_GUARD_DOWNLOAD_CHANGED"));
        }
    } else {
        match fs::symlink_metadata(target_path) {
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            _ => return Err(stable_error("ERR_FILE_GUARD_DOWNLOAD_CHANGED")),
        }
    }

    let mutation_parent = open_directory_for_mutation(directory)?;
    verify_not_reparse(&mutation_parent)?;
    if !same_file_object(identity(&mutation_parent)?, identity(&parent)?)
        || final_path(&mutation_parent)? != final_path(&parent)?
    {
        return Err(stable_error("ERR_FILE_GUARD_DOWNLOAD_CHANGED"));
    }
    rename_by_handle(&reopened_temporary, &mutation_parent, target_name, replace)
        .map_err(|_| stable_error("ERR_FILE_GUARD_DOWNLOAD_COMMIT"))
}

fn duplicate_fd(fd: i32, code: &'static str) -> Result<File> {
    let raw = unsafe { _get_osfhandle(fd) };
    if raw == -1 {
        return Err(stable_error(code));
    }
    let process = unsafe { GetCurrentProcess() };
    let mut duplicated: HANDLE = null_mut();
    if unsafe {
        DuplicateHandle(
            process,
            raw as HANDLE,
            process,
            &mut duplicated,
            0,
            0,
            DUPLICATE_SAME_ACCESS,
        )
    } == 0
    {
        return Err(stable_error(code));
    }
    Ok(unsafe { File::from_raw_handle(duplicated as _) })
}

fn remove_owned_file(root: &File, path: &Path) -> Result<()> {
    let file = open_file_for_delete(path)?;
    verify_regular(&file)?;
    ensure_handle_within_root(&file, root)?;
    let opened_identity = identity(&file)?;
    let reopened = open_file_no_reparse(path, false)?;
    if identity(&reopened)? != opened_identity || final_path(&reopened)? != final_path(&file)? {
        return Err(stable_error("ERR_FILE_GUARD_SNAPSHOT_CHANGED"));
    }
    drop(reopened);
    delete_by_handle(&file)
}

fn is_owned_name(name: &str) -> bool {
    is_snapshot_name(name) || has_safe_nonce(name, STAGING_PREFIX, STAGING_SUFFIX)
}

fn is_snapshot_name(name: &str) -> bool {
    has_safe_nonce(name, SNAPSHOT_PREFIX, SNAPSHOT_SUFFIX)
}

fn has_safe_nonce(name: &str, prefix: &str, suffix: &str) -> bool {
    let Some(nonce) = name
        .strip_prefix(prefix)
        .and_then(|value| value.strip_suffix(suffix))
    else {
        return false;
    };
    (16..=128).contains(&nonce.len())
        && nonce
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
}

fn validate_windows_path(path: &Path, code: &'static str) -> Result<()> {
    let value = path.to_string_lossy();
    let drive_path = value.len() >= 3
        && value.as_bytes()[0].is_ascii_alphabetic()
        && value.as_bytes()[1] == b':'
        && matches!(value.as_bytes()[2], b'\\' | b'/');
    let unc_path = value.starts_with(r"\\")
        && !value.starts_with(r"\\.\")
        && !value.starts_with(r"\\?\")
        && value[2..]
            .split(['\\', '/'])
            .filter(|part| !part.is_empty())
            .count()
            >= 2;
    let has_ads = if drive_path {
        value[2..].contains(':')
    } else {
        value.contains(':')
    };
    if (!drive_path && !unc_path) || has_ads {
        return Err(stable_error(code));
    }
    Ok(())
}

fn open_file_no_reparse(path: &Path, create_new: bool) -> Result<File> {
    let mut options = OpenOptions::new();
    options
        .read(!create_new)
        .write(create_new)
        .create_new(create_new)
        .access_mode(if create_new {
            GENERIC_READ | GENERIC_WRITE | DELETE
        } else {
            GENERIC_READ
        })
        .share_mode(FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE)
        .custom_flags(FILE_FLAG_OPEN_REPARSE_POINT | FILE_FLAG_SEQUENTIAL_SCAN);
    options.open(path).map_err(|_| {
        stable_error(if create_new {
            "ERR_FILE_GUARD_SNAPSHOT_CREATE"
        } else {
            "ERR_FILE_GUARD_SOURCE_OPEN"
        })
    })
}

fn open_file_for_delete(path: &Path) -> Result<File> {
    OpenOptions::new()
        .access_mode(GENERIC_READ | DELETE)
        .share_mode(FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE)
        .custom_flags(FILE_FLAG_OPEN_REPARSE_POINT)
        .open(path)
        .map_err(|_| stable_error("ERR_FILE_GUARD_SNAPSHOT_REMOVE"))
}

fn open_directory_no_reparse(path: &Path) -> Result<File> {
    OpenOptions::new()
        .read(true)
        .share_mode(FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE)
        .custom_flags(FILE_FLAG_OPEN_REPARSE_POINT | FILE_FLAG_BACKUP_SEMANTICS)
        .open(path)
        .map_err(|_| stable_error("ERR_FILE_GUARD_DIRECTORY_OPEN"))
}

fn open_directory_for_delete(path: &Path) -> Result<File> {
    OpenOptions::new()
        .access_mode(GENERIC_READ | DELETE)
        .share_mode(FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE)
        .custom_flags(FILE_FLAG_OPEN_REPARSE_POINT | FILE_FLAG_BACKUP_SEMANTICS)
        .open(path)
        .map_err(|_| stable_error("ERR_FILE_GUARD_DIRECTORY_OPEN"))
}

fn open_directory_for_acl(path: &Path) -> Result<File> {
    OpenOptions::new()
        .access_mode(GENERIC_READ | WRITE_DAC)
        .share_mode(FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE)
        .custom_flags(FILE_FLAG_OPEN_REPARSE_POINT | FILE_FLAG_BACKUP_SEMANTICS)
        .open(path)
        .map_err(|_| stable_error("ERR_FILE_GUARD_SPOOL_ACL"))
}

fn open_directory_for_mutation(path: &Path) -> Result<File> {
    OpenOptions::new()
        .access_mode(GENERIC_READ | GENERIC_WRITE)
        .share_mode(FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE)
        .custom_flags(FILE_FLAG_OPEN_REPARSE_POINT | FILE_FLAG_BACKUP_SEMANTICS)
        .open(path)
        .map_err(|_| stable_error("ERR_FILE_GUARD_DIRECTORY_OPEN"))
}

fn open_verified_directory_chain(path: &Path) -> Result<Vec<File>> {
    let mut paths: Vec<&Path> = path
        .ancestors()
        .filter(|candidate| !candidate.as_os_str().is_empty())
        .collect();
    paths.reverse();
    let mut handles: Vec<File> = Vec::with_capacity(paths.len());
    for candidate in paths {
        let handle = open_directory_no_reparse(candidate)?;
        verify_not_reparse(&handle)?;
        if let Some(parent) = handles.last() {
            ensure_direct_child(&handle, parent)?;
        } else if final_path(&handle)? != normalize_final_path(&candidate.to_string_lossy()) {
            return Err(stable_error("ERR_FILE_GUARD_REPARSE_POINT"));
        }
        handles.push(handle);
    }
    Ok(handles)
}

fn verify_components_no_reparse(path: &Path, include_final: bool) -> Result<()> {
    let first = if include_final {
        path
    } else {
        path.parent()
            .ok_or_else(|| stable_error("ERR_FILE_GUARD_PATH_INVALID"))?
    };
    for component in first.ancestors() {
        let handle = open_directory_no_reparse(component)?;
        verify_not_reparse(&handle)?;
    }
    Ok(())
}

fn verify_regular(file: &File) -> Result<()> {
    verify_not_reparse(file)?;
    let standard: FILE_STANDARD_INFO = file_info(file, FileStandardInfo)?;
    if standard.Directory != 0 || standard.DeletePending != 0 {
        return Err(stable_error("ERR_FILE_GUARD_NOT_REGULAR"));
    }
    Ok(())
}

fn verify_not_reparse(file: &File) -> Result<()> {
    let tag: FILE_ATTRIBUTE_TAG_INFO = file_info(file, FileAttributeTagInfo)?;
    if tag.FileAttributes & FILE_ATTRIBUTE_REPARSE_POINT != 0 {
        return Err(stable_error("ERR_FILE_GUARD_REPARSE_POINT"));
    }
    Ok(())
}

fn identity(file: &File) -> Result<Identity> {
    let id: FILE_ID_INFO = file_info(file, FileIdInfo)?;
    let standard: FILE_STANDARD_INFO = file_info(file, FileStandardInfo)?;
    let basic: FILE_BASIC_INFO = file_info(file, FileBasicInfo)?;
    Ok(Identity {
        volume: id.VolumeSerialNumber,
        file_id: id.FileId.Identifier,
        size: standard.EndOfFile,
        last_write: basic.LastWriteTime,
        change_time: basic.ChangeTime,
    })
}

fn same_file_object(left: Identity, right: Identity) -> bool {
    left.volume == right.volume && left.file_id == right.file_id
}

fn file_info<T>(file: &File, class: i32) -> Result<T> {
    let mut value: T = unsafe { zeroed() };
    let ok = unsafe {
        GetFileInformationByHandleEx(
            file.as_raw_handle() as HANDLE,
            class,
            &mut value as *mut T as *mut c_void,
            size_of::<T>() as u32,
        )
    };
    if ok == 0 {
        Err(stable_error("ERR_FILE_GUARD_IDENTITY"))
    } else {
        Ok(value)
    }
}

fn final_path(file: &File) -> Result<String> {
    let handle = file.as_raw_handle() as HANDLE;
    let required = unsafe {
        GetFinalPathNameByHandleW(
            handle,
            null_mut(),
            0,
            FILE_NAME_NORMALIZED | VOLUME_NAME_DOS,
        )
    };
    if required == 0 {
        return Err(stable_error("ERR_FILE_GUARD_FINAL_PATH"));
    }
    let mut buffer = vec![0_u16; required as usize + 1];
    let written = unsafe {
        GetFinalPathNameByHandleW(
            handle,
            buffer.as_mut_ptr(),
            buffer.len() as u32,
            FILE_NAME_NORMALIZED | VOLUME_NAME_DOS,
        )
    };
    if written == 0 || written as usize >= buffer.len() {
        return Err(stable_error("ERR_FILE_GUARD_FINAL_PATH"));
    }
    Ok(normalize_final_path(&String::from_utf16_lossy(
        &buffer[..written as usize],
    )))
}

fn normalize_final_path(value: &str) -> String {
    value
        .strip_prefix(r"\\?\UNC\")
        .map(|rest| format!(r"\\{rest}"))
        .or_else(|| value.strip_prefix(r"\\?\").map(str::to_owned))
        .unwrap_or_else(|| value.to_owned())
        .trim_end_matches(['\\', '/'])
        .to_lowercase()
}

fn ensure_handle_within_root(file: &File, root: &File) -> Result<()> {
    verify_not_reparse(root)?;
    let root_final = final_path(root)?;
    let child_final = final_path(file)?;
    let prefix = format!("{root_final}\\");
    if !child_final.starts_with(&prefix) || child_final[prefix.len()..].contains('\\') {
        return Err(stable_error("ERR_FILE_GUARD_OUTSIDE_SPOOL"));
    }
    Ok(())
}

fn ensure_direct_child(file: &File, parent: &File) -> Result<()> {
    verify_not_reparse(parent)?;
    let parent_final = final_path(parent)?;
    let child_final = final_path(file)?;
    let prefix = format!("{parent_final}\\");
    if !child_final.starts_with(&prefix) || child_final[prefix.len()..].contains('\\') {
        return Err(stable_error("ERR_FILE_GUARD_REPARSE_POINT"));
    }
    Ok(())
}

fn write_all_checked(file: &mut File, mut bytes: &[u8]) -> Result<()> {
    while !bytes.is_empty() {
        let written = file
            .write(bytes)
            .map_err(|_| stable_error("ERR_FILE_GUARD_SNAPSHOT_WRITE"))?;
        if written == 0 {
            return Err(stable_error("ERR_FILE_GUARD_SNAPSHOT_WRITE"));
        }
        bytes = &bytes[written..];
    }
    Ok(())
}

fn atomic_commit(file: &File, root: &File, committed_name: &std::ffi::OsStr) -> Result<()> {
    rename_by_handle(file, root, committed_name, false)
}

fn rename_by_handle(
    file: &File,
    root: &File,
    committed_name: &std::ffi::OsStr,
    replace: bool,
) -> Result<()> {
    let name: Vec<u16> = {
        use std::os::windows::ffi::OsStrExt;
        committed_name.encode_wide().collect()
    };
    let byte_len = size_of::<NtFileRenameInformation>() + name.len() * size_of::<u16>();
    let mut storage = vec![0_usize; byte_len.div_ceil(size_of::<usize>())];
    let info = storage.as_mut_ptr() as *mut NtFileRenameInformation;
    unsafe {
        (*info).replace_if_exists = u32::from(replace);
        (*info).root_directory = root.as_raw_handle() as HANDLE;
        (*info).file_name_length = (name.len() * size_of::<u16>()) as u32;
        std::ptr::copy_nonoverlapping(name.as_ptr(), (*info).file_name.as_mut_ptr(), name.len());
    }
    let mut io_status = NtIoStatusBlock {
        status_or_pointer: 0,
        information: 0,
    };
    let status = unsafe {
        NtSetInformationFile(
            file.as_raw_handle() as HANDLE,
            &mut io_status,
            info as *const c_void,
            byte_len as u32,
            FILE_RENAME_INFORMATION_CLASS,
        )
    };
    if status < 0 {
        Err(stable_error("ERR_FILE_GUARD_SNAPSHOT_COMMIT"))
    } else {
        Ok(())
    }
}

fn delete_by_handle(file: &File) -> Result<()> {
    let disposition = FILE_DISPOSITION_INFO { DeleteFile: 1 };
    let ok = unsafe {
        SetFileInformationByHandle(
            file.as_raw_handle() as HANDLE,
            FileDispositionInfo,
            &disposition as *const FILE_DISPOSITION_INFO as *const c_void,
            size_of::<FILE_DISPOSITION_INFO>() as u32,
        )
    };
    if ok == 0 {
        Err(stable_error("ERR_FILE_GUARD_SNAPSHOT_REMOVE"))
    } else {
        Ok(())
    }
}

fn apply_private_dacl(root: &File) -> Result<()> {
    let mut token: HANDLE = null_mut();
    if unsafe { OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token) } == 0 {
        return Err(stable_error("ERR_FILE_GUARD_SPOOL_ACL"));
    }
    let token_guard = HandleGuard(token);
    let mut needed = 0_u32;
    unsafe { GetTokenInformation(token_guard.0, TokenUser, null_mut(), 0, &mut needed) };
    if needed == 0 {
        return Err(stable_error("ERR_FILE_GUARD_SPOOL_ACL"));
    }
    let mut token_buffer = vec![0_u8; needed as usize];
    if unsafe {
        GetTokenInformation(
            token_guard.0,
            TokenUser,
            token_buffer.as_mut_ptr() as *mut c_void,
            needed,
            &mut needed,
        )
    } == 0
    {
        return Err(stable_error("ERR_FILE_GUARD_SPOOL_ACL"));
    }
    let user_sid = unsafe { (*(token_buffer.as_ptr() as *const TOKEN_USER)).User.Sid };
    let mut system_sid_buffer = vec![0_u8; 68];
    let mut system_sid_size = system_sid_buffer.len() as u32;
    if unsafe {
        CreateWellKnownSid(
            WinLocalSystemSid,
            null_mut(),
            system_sid_buffer.as_mut_ptr() as PSID,
            &mut system_sid_size,
        )
    } == 0
    {
        return Err(stable_error("ERR_FILE_GUARD_SPOOL_ACL"));
    }
    let system_sid = system_sid_buffer.as_mut_ptr() as PSID;
    let acl_size = size_of::<ACL>()
        + unsafe { GetLengthSid(user_sid) as usize }
        + unsafe { GetLengthSid(system_sid) as usize }
        + 128;
    let mut acl_buffer = vec![0_u8; acl_size];
    let acl = acl_buffer.as_mut_ptr() as *mut ACL;
    if unsafe { InitializeAcl(acl, acl_size as u32, ACL_REVISION) } == 0
        || unsafe {
            AddAccessAllowedAceEx(
                acl,
                ACL_REVISION,
                OBJECT_INHERIT_ACE | CONTAINER_INHERIT_ACE,
                FILE_ALL_ACCESS,
                user_sid,
            )
        } == 0
        || unsafe {
            AddAccessAllowedAceEx(
                acl,
                ACL_REVISION,
                OBJECT_INHERIT_ACE | CONTAINER_INHERIT_ACE,
                FILE_ALL_ACCESS,
                system_sid,
            )
        } == 0
    {
        return Err(stable_error("ERR_FILE_GUARD_SPOOL_ACL"));
    }
    let status = unsafe {
        SetSecurityInfo(
            root.as_raw_handle() as HANDLE,
            SE_FILE_OBJECT,
            DACL_SECURITY_INFORMATION | PROTECTED_DACL_SECURITY_INFORMATION,
            null_mut(),
            null_mut(),
            acl,
            null(),
        )
    };
    if status != ERROR_SUCCESS {
        return Err(stable_error("ERR_FILE_GUARD_SPOOL_ACL"));
    }
    Ok(())
}

struct HandleGuard(HANDLE);

impl Drop for HandleGuard {
    fn drop(&mut self) {
        unsafe { CloseHandle(self.0) };
    }
}

struct DeleteOnDrop {
    path: PathBuf,
    armed: bool,
}

impl DeleteOnDrop {
    fn new(path: PathBuf) -> Self {
        Self { path, armed: true }
    }

    fn disarm(&mut self) {
        self.armed = false;
    }
}

impl Drop for DeleteOnDrop {
    fn drop(&mut self) {
        if self.armed {
            let _ = fs::remove_file(&self.path);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn owned_name_requires_exact_prefix_suffix_and_safe_nonce() {
        assert!(is_owned_name("yuance-snapshot-0123456789abcdef.bin"));
        assert!(is_owned_name(".yuance-staging-0123456789abcdef.tmp"));
        assert!(!is_owned_name("snapshot-0123456789abcdef.bin"));
        assert!(!is_owned_name("yuance-snapshot-../../unsafe.bin"));
        assert!(!is_owned_name("yuance-snapshot-short.bin"));
    }

    #[test]
    fn final_path_boundary_is_case_insensitive() {
        assert_eq!(normalize_final_path(r"\\?\C:\Spool\"), r"c:\spool");
        assert_eq!(
            normalize_final_path(r"\\?\UNC\server\share\Spool"),
            r"\\server\share\spool"
        );
    }

    #[test]
    fn directory_object_identity_ignores_expected_metadata_changes() {
        let original = Identity {
            volume: 7,
            file_id: [3; 16],
            size: 0,
            last_write: 10,
            change_time: 11,
        };
        assert!(same_file_object(
            original,
            Identity {
                size: 4096,
                last_write: 12,
                change_time: 13,
                ..original
            }
        ));
        assert!(!same_file_object(
            original,
            Identity {
                file_id: [4; 16],
                ..original
            }
        ));
    }

    #[test]
    fn captures_and_removes_regular_file() {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        let test_root =
            std::env::temp_dir().join(format!("yuance-file-guard-{}-{suffix}", std::process::id()));
        let source_root = test_root.join("source");
        let spool_root = test_root.join("spool");
        fs::create_dir_all(&source_root).expect("source root");
        let source = source_root.join("canary.txt");
        fs::write(&source, b"yuance-file-guard-canary").expect("source file");

        let result = capture(ValidatedInput {
            source_path: source.to_string_lossy().into_owned(),
            spool_root: spool_root.to_string_lossy().into_owned(),
            nonce: "0123456789abcdef".into(),
            max_bytes: 1024,
        })
        .expect("capture");
        assert_eq!(result.byte_size, 24);
        assert_eq!(
            result.sha256,
            "00bd873a7ed30e964fb407e7d2b3c1fad1faf55c2733fd4c29096c19ca363efd"
        );
        assert_eq!(
            fs::read(&result.private_path).expect("snapshot"),
            b"yuance-file-guard-canary"
        );

        remove_snapshot(spool_root.to_string_lossy().as_ref(), &result.private_path)
            .expect("remove snapshot");
        assert!(!Path::new(&result.private_path).exists());
        assert_eq!(
            cleanup_spool(spool_root.to_string_lossy().as_ref()).expect("cleanup"),
            0
        );
        fs::remove_dir_all(test_root).expect("test cleanup");
    }
}
