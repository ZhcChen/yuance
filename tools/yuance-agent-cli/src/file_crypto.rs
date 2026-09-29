use std::{
    fs::File,
    io::{self, Read},
    path::{Path, PathBuf},
    pin::Pin,
    sync::{Arc, Mutex},
    task::{Context, Poll},
};

use aes_gcm::{
    Aes256Gcm, Nonce,
    aead::{Aead, KeyInit, Payload},
};
use bytes::Bytes;
use futures_util::Stream;
use rand::{RngCore, rngs::OsRng};
use sha2::{Digest, Sha256};

pub const FILE_CHUNK_SIZE: usize = 1024 * 1024;
pub const FILE_ENCRYPTION_FORMAT: &str = "YUANCE-ENC-v1";

const MAGIC: &[u8; 13] = b"YUANCE-ENC-v1";
const FORMAT_VERSION: u32 = 1;
const NONCE_LENGTH: usize = 12;
const HEADER_FIXED_LENGTH: usize = 13 + 4 + 4 + 8 + 32 + 4;

pub fn encrypted_total_size(plaintext: u64) -> u64 {
    let chunks = if plaintext == 0 {
        0
    } else {
        plaintext.div_ceil(FILE_CHUNK_SIZE as u64)
    };
    HEADER_FIXED_LENGTH as u64 + chunks * NONCE_LENGTH as u64 + plaintext + chunks * 16
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FileDigest {
    pub byte_size: u64,
    pub sha256: String,
}

pub fn hash_file(path: &Path) -> io::Result<FileDigest> {
    let mut file = File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buffer = vec![0_u8; FILE_CHUNK_SIZE];
    let mut byte_size = 0_u64;
    loop {
        let read = file.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        byte_size += read as u64;
        hasher.update(&buffer[..read]);
    }
    Ok(FileDigest {
        byte_size,
        sha256: hex::encode(hasher.finalize()),
    })
}

pub fn decrypt_file(
    ciphertext: &[u8],
    file_object_id: i64,
    key: [u8; 32],
    plaintext_byte_size: u64,
    plaintext_sha256: &str,
) -> io::Result<Vec<u8>> {
    if file_object_id < 1 || plaintext_byte_size > usize::MAX as u64 {
        return Err(invalid_encrypted_file());
    }
    let expected_sha = if plaintext_sha256.is_empty() {
        None
    } else {
        Some(decode_sha256(plaintext_sha256)?)
    };
    let expected_encrypted_size = encrypted_total_size(plaintext_byte_size);
    if ciphertext.len() as u64 != expected_encrypted_size
        || ciphertext.len() < HEADER_FIXED_LENGTH
        || &ciphertext[..MAGIC.len()] != MAGIC
    {
        return Err(invalid_encrypted_file());
    }

    let version = read_u32(ciphertext, MAGIC.len())?;
    let chunk_size = read_u32(ciphertext, MAGIC.len() + 4)? as usize;
    let header_plaintext_size = read_u64(ciphertext, MAGIC.len() + 8)?;
    let sha_start = MAGIC.len() + 4 + 4 + 8;
    let header_sha = &ciphertext[sha_start..sha_start + 32];
    let count_offset = sha_start + 32;
    let header_chunk_count = read_u32(ciphertext, count_offset)? as usize;
    let expected_chunk_count = chunk_count(plaintext_byte_size);
    let nonce_start = count_offset + 4;
    let header_size = nonce_start
        .checked_add(
            header_chunk_count
                .checked_mul(NONCE_LENGTH)
                .ok_or_else(invalid_encrypted_file)?,
        )
        .ok_or_else(invalid_encrypted_file)?;

    if version != FORMAT_VERSION
        || chunk_size != FILE_CHUNK_SIZE
        || header_plaintext_size != plaintext_byte_size
        || header_chunk_count != expected_chunk_count
        || header_size > ciphertext.len()
        || expected_sha.is_some_and(|expected| header_sha != expected)
    {
        return Err(invalid_encrypted_file());
    }

    let cipher = Aes256Gcm::new_from_slice(&key).map_err(|_| invalid_encrypted_file())?;
    let mut plaintext = Vec::with_capacity(plaintext_byte_size as usize);
    let mut cursor = header_size;
    for index in 0..header_chunk_count {
        let plaintext_length = plaintext_chunk_len(plaintext_byte_size, index);
        let encrypted_length = plaintext_length + 16;
        let end = cursor
            .checked_add(encrypted_length)
            .filter(|end| *end <= ciphertext.len())
            .ok_or_else(invalid_encrypted_file)?;
        let nonce_start = nonce_start + index * NONCE_LENGTH;
        let nonce: [u8; NONCE_LENGTH] = ciphertext[nonce_start..nonce_start + NONCE_LENGTH]
            .try_into()
            .map_err(|_| invalid_encrypted_file())?;
        let aad = chunk_aad(file_object_id, index as u32);
        let decrypted = cipher
            .decrypt(
                &Nonce::from(nonce),
                Payload {
                    msg: &ciphertext[cursor..end],
                    aad: &aad,
                },
            )
            .or_else(|_| {
                cipher.decrypt(
                    &Nonce::from(nonce),
                    Payload {
                        msg: &ciphertext[cursor..end],
                        aad: &legacy_chunk_aad(file_object_id, index as u32),
                    },
                )
            })
            .map_err(|_| invalid_encrypted_file())?;
        if decrypted.len() != plaintext_length {
            return Err(invalid_encrypted_file());
        }
        plaintext.extend_from_slice(&decrypted);
        cursor = end;
    }

    let actual_sha: [u8; 32] = Sha256::digest(&plaintext).into();
    if cursor != ciphertext.len()
        || plaintext.len() as u64 != plaintext_byte_size
        || actual_sha != header_sha
        || expected_sha.is_some_and(|expected| actual_sha != expected)
    {
        return Err(invalid_encrypted_file());
    }
    Ok(plaintext)
}

fn read_u32(bytes: &[u8], offset: usize) -> io::Result<u32> {
    bytes
        .get(offset..offset + 4)
        .and_then(|value| value.try_into().ok())
        .map(u32::from_be_bytes)
        .ok_or_else(invalid_encrypted_file)
}

fn read_u64(bytes: &[u8], offset: usize) -> io::Result<u64> {
    bytes
        .get(offset..offset + 8)
        .and_then(|value| value.try_into().ok())
        .map(u64::from_be_bytes)
        .ok_or_else(invalid_encrypted_file)
}

fn decode_sha256(value: &str) -> io::Result<[u8; 32]> {
    let bytes = hex::decode(value).map_err(|_| invalid_encrypted_file())?;
    bytes.try_into().map_err(|_| invalid_encrypted_file())
}

fn invalid_encrypted_file() -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, "加密附件校验失败")
}

#[derive(Debug, Clone)]
pub struct EncryptionDigest {
    state: Arc<Mutex<DigestState>>,
}

impl EncryptionDigest {
    pub fn encrypted_sha256(&self) -> io::Result<String> {
        let state = self
            .state
            .lock()
            .map_err(|_| io::Error::other("加密摘要状态不可用"))?;
        if !state.finished {
            return Err(io::Error::new(io::ErrorKind::WouldBlock, "加密流尚未完成"));
        }
        Ok(hex::encode(state.hasher.clone().finalize()))
    }
}

#[derive(Debug)]
pub struct EncryptedFileBody {
    stream: EncryptedFileStream,
    digest: EncryptionDigest,
}

impl EncryptedFileBody {
    pub fn open(
        path: impl Into<PathBuf>,
        file_object_id: i64,
        key: [u8; 32],
        plaintext: &FileDigest,
    ) -> io::Result<Self> {
        let path = path.into();
        let stream = EncryptedFileStream::open(path, file_object_id, key, plaintext)?;
        let digest = EncryptionDigest {
            state: Arc::clone(&stream.digest),
        };
        Ok(Self { stream, digest })
    }

    pub fn digest(&self) -> EncryptionDigest {
        self.digest.clone()
    }

    pub fn into_body(self) -> reqwest::Body {
        reqwest::Body::wrap_stream(self.stream)
    }
}

#[derive(Debug)]
struct DigestState {
    hasher: Sha256,
    finished: bool,
}

#[derive(Debug)]
pub struct EncryptedFileStream {
    file: File,
    path: PathBuf,
    file_object_id: i64,
    key: [u8; 32],
    plaintext: FileDigest,
    expected_signature: FileSignature,
    header: Option<Bytes>,
    nonces: Vec<[u8; NONCE_LENGTH]>,
    chunk_index: usize,
    digest: Arc<Mutex<DigestState>>,
    plaintext_hasher: Sha256,
    finished: bool,
}

impl EncryptedFileStream {
    pub fn open(
        path: PathBuf,
        file_object_id: i64,
        key: [u8; 32],
        plaintext: &FileDigest,
    ) -> io::Result<Self> {
        if file_object_id < 1 {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "文件对象 ID 无效",
            ));
        }
        let signature = FileSignature::read(&path)?;
        if signature.byte_size != plaintext.byte_size {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "文件大小在上传前已变化",
            ));
        }
        let file = File::open(&path)?;
        let chunk_count = chunk_count(plaintext.byte_size);
        let mut nonces = Vec::with_capacity(chunk_count);
        for _ in 0..chunk_count {
            let mut nonce = [0_u8; NONCE_LENGTH];
            OsRng.fill_bytes(&mut nonce);
            nonces.push(nonce);
        }
        let header = create_header(plaintext, &nonces);
        Ok(Self {
            file,
            path,
            file_object_id,
            key,
            plaintext: plaintext.clone(),
            expected_signature: signature,
            header: Some(Bytes::from(header)),
            nonces,
            chunk_index: 0,
            digest: Arc::new(Mutex::new(DigestState {
                hasher: Sha256::new(),
                finished: false,
            })),
            plaintext_hasher: Sha256::new(),
            finished: false,
        })
    }

    pub fn digest(&self) -> EncryptionDigest {
        EncryptionDigest {
            state: Arc::clone(&self.digest),
        }
    }
}

impl Stream for EncryptedFileStream {
    type Item = Result<Bytes, io::Error>;

    fn poll_next(mut self: Pin<&mut Self>, _cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        if self.finished {
            return Poll::Ready(None);
        }
        if let Some(header) = self.header.take() {
            if let Err(error) = update_digest(&self.digest, &header, false) {
                self.finished = true;
                return Poll::Ready(Some(Err(error)));
            }
            return Poll::Ready(Some(Ok(header)));
        }

        let total_chunks = chunk_count(self.plaintext.byte_size);
        if self.chunk_index >= total_chunks {
            match FileSignature::read(&self.path) {
                Ok(signature) if signature == self.expected_signature => {
                    if hex::encode(self.plaintext_hasher.clone().finalize())
                        != self.plaintext.sha256
                    {
                        self.finished = true;
                        return Poll::Ready(Some(Err(io::Error::new(
                            io::ErrorKind::InvalidData,
                            "文件在上传期间发生变化",
                        ))));
                    }
                    self.finished = true;
                    if let Ok(mut digest) = self.digest.lock() {
                        digest.finished = true;
                    }
                    Poll::Ready(None)
                }
                Ok(_) => {
                    self.finished = true;
                    Poll::Ready(Some(Err(io::Error::new(
                        io::ErrorKind::InvalidData,
                        "文件在上传期间发生变化",
                    ))))
                }
                Err(error) => {
                    self.finished = true;
                    Poll::Ready(Some(Err(error)))
                }
            }
        } else {
            let expected = plaintext_chunk_len(self.plaintext.byte_size, self.chunk_index);
            let mut plaintext = vec![0_u8; expected];
            if let Err(error) = self.file.read_exact(&mut plaintext) {
                self.finished = true;
                return Poll::Ready(Some(Err(error)));
            }
            let cipher = Aes256Gcm::new_from_slice(&self.key)
                .map_err(|_| io::Error::new(io::ErrorKind::InvalidInput, "加密密钥无效"));
            let Ok(cipher) = cipher else {
                self.finished = true;
                return Poll::Ready(Some(Err(cipher.err().unwrap())));
            };
            self.plaintext_hasher.update(&plaintext);
            let aad = chunk_aad(self.file_object_id, self.chunk_index as u32);
            let encrypted = match cipher.encrypt(
                &Nonce::from(self.nonces[self.chunk_index]),
                Payload {
                    msg: &plaintext,
                    aad: &aad,
                },
            ) {
                Ok(value) => Bytes::from(value),
                Err(_) => {
                    self.finished = true;
                    return Poll::Ready(Some(Err(io::Error::other("文件分块加密失败"))));
                }
            };
            self.chunk_index += 1;
            if let Err(error) = update_digest(&self.digest, &encrypted, false) {
                self.finished = true;
                return Poll::Ready(Some(Err(error)));
            }
            if self.chunk_index == total_chunks {
                match FileSignature::read(&self.path) {
                    Ok(signature) if signature == self.expected_signature => {
                        if hex::encode(self.plaintext_hasher.clone().finalize())
                            != self.plaintext.sha256
                        {
                            self.finished = true;
                            return Poll::Ready(Some(Err(io::Error::new(
                                io::ErrorKind::InvalidData,
                                "文件在上传期间发生变化",
                            ))));
                        }
                        self.finished = true;
                        if let Ok(mut digest) = self.digest.lock() {
                            digest.finished = true;
                        }
                    }
                    Ok(_) => {
                        self.finished = true;
                        return Poll::Ready(Some(Err(io::Error::new(
                            io::ErrorKind::InvalidData,
                            "文件在上传期间发生变化",
                        ))));
                    }
                    Err(error) => {
                        self.finished = true;
                        return Poll::Ready(Some(Err(error)));
                    }
                }
            }
            Poll::Ready(Some(Ok(encrypted)))
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct FileSignature {
    byte_size: u64,
    modified: Option<std::time::SystemTime>,
}

impl FileSignature {
    fn read(path: &Path) -> io::Result<Self> {
        let metadata = std::fs::metadata(path)?;
        if !metadata.is_file() {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "上传路径必须是普通文件",
            ));
        }
        Ok(Self {
            byte_size: metadata.len(),
            modified: metadata.modified().ok(),
        })
    }
}

fn update_digest(
    state: &Arc<Mutex<DigestState>>,
    bytes: &[u8],
    _plaintext: bool,
) -> io::Result<()> {
    state
        .lock()
        .map_err(|_| io::Error::other("加密摘要状态不可用"))?
        .hasher
        .update(bytes);
    Ok(())
}

fn create_header(plaintext: &FileDigest, nonces: &[[u8; NONCE_LENGTH]]) -> Vec<u8> {
    let mut header = Vec::with_capacity(HEADER_FIXED_LENGTH + nonces.len() * NONCE_LENGTH);
    header.extend_from_slice(MAGIC);
    header.extend_from_slice(&FORMAT_VERSION.to_be_bytes());
    header.extend_from_slice(&(FILE_CHUNK_SIZE as u32).to_be_bytes());
    header.extend_from_slice(&plaintext.byte_size.to_be_bytes());
    header.extend_from_slice(&hex::decode(&plaintext.sha256).expect("file digest is valid hex"));
    header.extend_from_slice(&(nonces.len() as u32).to_be_bytes());
    for nonce in nonces {
        header.extend_from_slice(nonce);
    }
    header
}

fn chunk_count(byte_size: u64) -> usize {
    if byte_size == 0 {
        0
    } else {
        byte_size.div_ceil(FILE_CHUNK_SIZE as u64) as usize
    }
}

fn plaintext_chunk_len(byte_size: u64, index: usize) -> usize {
    byte_size
        .saturating_sub(index as u64 * FILE_CHUNK_SIZE as u64)
        .min(FILE_CHUNK_SIZE as u64) as usize
}

fn chunk_aad(file_object_id: i64, chunk_index: u32) -> Vec<u8> {
    let mut aad = Vec::with_capacity(13 + 8 + 1 + 4);
    aad.extend_from_slice(b"yuance-file-enc:v1:");
    aad.extend_from_slice(&(file_object_id as u64).to_be_bytes());
    aad.push(b':');
    aad.extend_from_slice(&chunk_index.to_be_bytes());
    aad
}

fn legacy_chunk_aad(file_object_id: i64, chunk_index: u32) -> Vec<u8> {
    let mut aad = Vec::with_capacity(13 + 8 + 1 + 4);
    aad.extend_from_slice(b"yuance-file-enc:v1:");
    aad.extend_from_slice(&(file_object_id as u64).to_be_bytes());
    aad.push(0);
    aad.extend_from_slice(&chunk_index.to_be_bytes());
    aad
}
