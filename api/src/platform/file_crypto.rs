use aes_gcm::{
    Aes256Gcm, Nonce,
    aead::{Aead, KeyInit, Payload},
};
use base64::{Engine, engine::general_purpose::STANDARD as BASE64};
use hkdf::Hkdf;
use rand_core::{OsRng, RngCore};
use sha2::{Digest, Sha256};

use crate::platform::error::{AppError, AppResult};

pub const FILE_CHUNK_SIZE: usize = 1024 * 1024;
pub const FILE_ENCRYPTION_FORMAT: &str = "YUANCE-ENC-v1";
const FILE_MAGIC: &[u8; 13] = b"YUANCE-ENC-v1";
const FILE_FORMAT_VERSION: u32 = 1;
const NONCE_LEN: usize = 12;
const TAG_LEN: usize = 16;
const DATA_KEY_LEN: usize = 32;
const KEY_VERSION: &str = "v1";
const FILE_MASTER_KEY_MIN_LEN: usize = 16;

const FILE_HEADER_FIXED_LEN: usize = FILE_MAGIC.len()
    + 4 // format version
    + 4 // chunk size
    + 8 // plaintext size
    + 32 // plaintext sha256
    + 4; // chunk count

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FileEncryptionHeader {
    pub chunk_size: usize,
    pub plaintext_byte_size: u64,
    pub plaintext_sha256: [u8; 32],
    pub chunk_count: u32,
    pub nonces: Vec<[u8; NONCE_LEN]>,
}

pub fn generate_data_key() -> [u8; DATA_KEY_LEN] {
    let mut key = [0_u8; DATA_KEY_LEN];
    OsRng.fill_bytes(&mut key);
    key
}

pub fn encrypt_plaintext(
    data_key: &[u8; DATA_KEY_LEN],
    file_object_id: i64,
    plaintext: &[u8],
) -> AppResult<Vec<u8>> {
    let chunk_count = chunk_count_for(plaintext.len(), FILE_CHUNK_SIZE);
    let nonces = random_nonces(chunk_count);
    let header = build_header(plaintext, &nonces);
    let mut ciphertext = Vec::with_capacity(header.len() + encrypted_body_len(plaintext.len()));
    ciphertext.extend_from_slice(&header);

    for (chunk_index, chunk) in plaintext.chunks(FILE_CHUNK_SIZE).enumerate() {
        ciphertext.extend_from_slice(&encrypt_chunk(
            data_key,
            file_object_id,
            chunk_index as u32,
            &nonces[chunk_index],
            chunk,
        )?);
    }
    Ok(ciphertext)
}

pub fn decrypt_ciphertext_full(
    data_key: &[u8; DATA_KEY_LEN],
    file_object_id: i64,
    ciphertext: &[u8],
) -> AppResult<Vec<u8>> {
    let (header, body) = parse_header(ciphertext)?;
    let mut plaintext = Vec::with_capacity(header.plaintext_byte_size as usize);
    let mut offset = 0_usize;
    for chunk_index in 0..header.chunk_count {
        let chunk_len =
            chunk_plaintext_len(header.chunk_size, header.plaintext_byte_size, chunk_index);
        let chunk = body
            .get(offset..offset + chunk_len + TAG_LEN)
            .ok_or_else(|| AppError::Crypto("加密文件分块数据不完整".to_string()))?;
        plaintext.extend_from_slice(&decrypt_chunk(
            data_key,
            file_object_id,
            chunk_index,
            &header.nonces[chunk_index as usize],
            chunk,
        )?);
        offset += chunk_len + TAG_LEN;
    }
    verify_plaintext_sha256(&plaintext, &header.plaintext_sha256)?;
    Ok(plaintext)
}

/// 解密密文中的指定明文范围 `[start, end)`，`ciphertext` 必须包含完整文件。
pub fn decrypt_plaintext_range(
    data_key: &[u8; DATA_KEY_LEN],
    file_object_id: i64,
    ciphertext: &[u8],
    start: usize,
    end_exclusive: usize,
) -> AppResult<Vec<u8>> {
    let (header, body) = parse_header(ciphertext)?;
    let plaintext_total = header.plaintext_byte_size as usize;
    if start >= plaintext_total || end_exclusive > plaintext_total || start >= end_exclusive {
        return Ok(Vec::new());
    }

    let first_chunk = start / header.chunk_size;
    let last_chunk = (end_exclusive - 1) / header.chunk_size;
    let mut output = Vec::with_capacity(end_exclusive - start);
    let mut body_offset = 0_usize;
    for chunk_index in 0..=last_chunk {
        let chunk_plaintext_len = chunk_plaintext_len(
            header.chunk_size,
            header.plaintext_byte_size,
            chunk_index as u32,
        );
        let chunk = body
            .get(body_offset..body_offset + chunk_plaintext_len + TAG_LEN)
            .ok_or_else(|| AppError::Crypto("加密文件分块数据不完整".to_string()))?;
        if chunk_index >= first_chunk {
            let chunk_start = chunk_index * header.chunk_size;
            let cut_start = start.saturating_sub(chunk_start);
            let cut_end = end_exclusive
                .saturating_sub(chunk_start)
                .min(chunk_plaintext_len);
            if cut_start < cut_end {
                let plaintext = decrypt_chunk(
                    data_key,
                    file_object_id,
                    chunk_index as u32,
                    &header.nonces[chunk_index as usize],
                    chunk,
                )?;
                output.extend_from_slice(&plaintext[cut_start..cut_end]);
            }
        }
        body_offset += chunk_plaintext_len + TAG_LEN;
    }
    Ok(output)
}

pub fn encrypted_total_size(plaintext_byte_size: u64) -> usize {
    let plaintext_len = plaintext_byte_size as usize;
    let chunk_count = chunk_count_for(plaintext_len, FILE_CHUNK_SIZE);
    FILE_HEADER_FIXED_LEN + chunk_count as usize * NONCE_LEN + encrypted_body_len(plaintext_len)
}

pub fn header_len_for(plaintext_byte_size: u64) -> usize {
    let chunk_count = chunk_count_for(plaintext_byte_size as usize, FILE_CHUNK_SIZE);
    FILE_HEADER_FIXED_LEN + chunk_count as usize * NONCE_LEN
}

pub fn parse_encryption_header(bytes: &[u8]) -> AppResult<FileEncryptionHeader> {
    let (header, _) = parse_header(bytes)?;
    Ok(header)
}

pub fn chunk_plaintext_len(chunk_size: usize, plaintext_byte_size: u64, chunk_index: u32) -> usize {
    let plaintext_len = plaintext_byte_size as usize;
    let offset = chunk_index as usize * chunk_size;
    if offset >= plaintext_len {
        0
    } else {
        (plaintext_len - offset).min(chunk_size)
    }
}

pub fn chunk_ciphertext_len(header: &FileEncryptionHeader, chunk_index: u32) -> usize {
    chunk_plaintext_len(header.chunk_size, header.plaintext_byte_size, chunk_index) + TAG_LEN
}

pub fn body_offset_for_chunk(header: &FileEncryptionHeader, chunk_index: u32) -> usize {
    (0..chunk_index)
        .map(|index| chunk_ciphertext_len(header, index))
        .sum()
}

/// 解密从 OSS 按块读取的一段密文 body，并裁剪到请求的明文范围。
/// `body` 必须从 `body_chunk_start` 块开始连续包含到 `body_chunk_end_exclusive`。
pub fn decrypt_body_range(
    data_key: &[u8; DATA_KEY_LEN],
    file_object_id: i64,
    header: &FileEncryptionHeader,
    body: &[u8],
    body_chunk_start: u32,
    body_chunk_end_exclusive: u32,
    plaintext_start: usize,
    plaintext_end_exclusive: usize,
) -> AppResult<Vec<u8>> {
    if body_chunk_start >= body_chunk_end_exclusive || plaintext_start >= plaintext_end_exclusive {
        return Ok(Vec::new());
    }
    let expected_len = (body_chunk_start..body_chunk_end_exclusive)
        .map(|index| chunk_ciphertext_len(header, index))
        .sum::<usize>();
    if body.len() < expected_len {
        return Err(AppError::Crypto("加密文件分块数据不完整".to_string()));
    }

    let mut output = Vec::with_capacity(plaintext_end_exclusive - plaintext_start);
    let mut body_offset = 0_usize;
    for chunk_index in body_chunk_start..body_chunk_end_exclusive {
        let chunk_len = chunk_ciphertext_len(header, chunk_index);
        let chunk = body
            .get(body_offset..body_offset + chunk_len)
            .ok_or_else(|| AppError::Crypto("加密文件分块数据不完整".to_string()))?;
        let chunk_plaintext_len =
            chunk_plaintext_len(header.chunk_size, header.plaintext_byte_size, chunk_index);
        let chunk_start = chunk_index as usize * header.chunk_size;
        let cut_start = plaintext_start.saturating_sub(chunk_start);
        let cut_end = plaintext_end_exclusive
            .saturating_sub(chunk_start)
            .min(chunk_plaintext_len);
        if cut_start < cut_end {
            let plaintext = decrypt_chunk(
                data_key,
                file_object_id,
                chunk_index,
                &header.nonces[chunk_index as usize],
                chunk,
            )?;
            output.extend_from_slice(&plaintext[cut_start..cut_end]);
        }
        body_offset += chunk_len;
    }
    Ok(output)
}

pub fn seal_data_key(
    file_master_key: &str,
    data_key: &[u8; DATA_KEY_LEN],
    aad: &[u8],
) -> AppResult<String> {
    let cipher = file_master_cipher(file_master_key)?;
    let mut nonce_bytes = [0_u8; NONCE_LEN];
    OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from(nonce_bytes);
    let ciphertext = cipher
        .encrypt(&nonce, Payload { msg: data_key, aad })
        .map_err(|_| AppError::Crypto("文件密钥封装失败".to_string()))?;
    Ok(format!(
        "{KEY_VERSION}:{}:{}",
        BASE64.encode(nonce_bytes),
        BASE64.encode(ciphertext)
    ))
}

pub fn open_data_key(
    file_master_key: &str,
    envelope: &str,
    aad: &[u8],
) -> AppResult<[u8; DATA_KEY_LEN]> {
    let mut parts = envelope.splitn(3, ':');
    let version = parts.next().unwrap_or_default();
    let nonce = parts.next().unwrap_or_default();
    let payload = parts.next().unwrap_or_default();
    if version != KEY_VERSION || nonce.is_empty() || payload.is_empty() {
        return Err(AppError::Crypto("文件密钥信封格式无效".to_string()));
    }
    let nonce_bytes = BASE64
        .decode(nonce)
        .map_err(|_| AppError::Crypto("文件密钥信封 nonce 无效".to_string()))?;
    let nonce: [u8; NONCE_LEN] = nonce_bytes
        .try_into()
        .map_err(|_| AppError::Crypto("文件密钥信封 nonce 长度无效".to_string()))?;
    let payload = BASE64
        .decode(payload)
        .map_err(|_| AppError::Crypto("文件密钥信封内容无效".to_string()))?;
    let cipher = file_master_cipher(file_master_key)?;
    let plaintext = cipher
        .decrypt(&Nonce::from(nonce), Payload { msg: &payload, aad })
        .map_err(|_| AppError::Crypto("文件密钥信封解密失败".to_string()))?;
    plaintext
        .try_into()
        .map_err(|_| AppError::Crypto("文件密钥长度无效".to_string()))
}

fn build_header(plaintext: &[u8], nonces: &[[u8; NONCE_LEN]]) -> Vec<u8> {
    let mut header = Vec::with_capacity(FILE_HEADER_FIXED_LEN + nonces.len() * NONCE_LEN);
    header.extend_from_slice(FILE_MAGIC);
    header.extend_from_slice(&FILE_FORMAT_VERSION.to_be_bytes());
    header.extend_from_slice(&(FILE_CHUNK_SIZE as u32).to_be_bytes());
    header.extend_from_slice(&(plaintext.len() as u64).to_be_bytes());
    header.extend_from_slice(&Sha256::digest(plaintext));
    header.extend_from_slice(&(nonces.len() as u32).to_be_bytes());
    for nonce in nonces {
        header.extend_from_slice(nonce);
    }
    header
}

fn parse_header(ciphertext: &[u8]) -> AppResult<(FileEncryptionHeader, &[u8])> {
    if ciphertext.len() < FILE_HEADER_FIXED_LEN || &ciphertext[..FILE_MAGIC.len()] != FILE_MAGIC {
        return Err(AppError::Crypto("加密文件头无效".to_string()));
    }
    let mut cursor = FILE_MAGIC.len();
    let version = read_u32(ciphertext, &mut cursor)?;
    if version != FILE_FORMAT_VERSION {
        return Err(AppError::Crypto("加密文件版本不受支持".to_string()));
    }
    let chunk_size = read_u32(ciphertext, &mut cursor)? as usize;
    if chunk_size == 0 {
        return Err(AppError::Crypto("加密文件分块大小无效".to_string()));
    }
    let plaintext_byte_size = read_u64(ciphertext, &mut cursor)?;
    let mut plaintext_sha256 = [0_u8; 32];
    plaintext_sha256.copy_from_slice(
        ciphertext
            .get(cursor..cursor + 32)
            .ok_or_else(|| AppError::Crypto("加密文件头不完整".to_string()))?,
    );
    cursor += 32;
    let chunk_count = read_u32(ciphertext, &mut cursor)?;
    let nonces_len = chunk_count as usize * NONCE_LEN;
    let header_len = cursor + nonces_len;
    let nonce_bytes = ciphertext
        .get(cursor..header_len)
        .ok_or_else(|| AppError::Crypto("加密文件 nonce 表不完整".to_string()))?;
    let mut nonces = Vec::with_capacity(chunk_count as usize);
    for nonce in nonce_bytes.chunks_exact(NONCE_LEN) {
        let mut value = [0_u8; NONCE_LEN];
        value.copy_from_slice(nonce);
        nonces.push(value);
    }
    let body = ciphertext
        .get(header_len..)
        .ok_or_else(|| AppError::Crypto("加密文件体不完整".to_string()))?;
    Ok((
        FileEncryptionHeader {
            chunk_size,
            plaintext_byte_size,
            plaintext_sha256,
            chunk_count,
            nonces,
        },
        body,
    ))
}

fn encrypt_chunk(
    data_key: &[u8; DATA_KEY_LEN],
    file_object_id: i64,
    chunk_index: u32,
    nonce: &[u8; NONCE_LEN],
    plaintext: &[u8],
) -> AppResult<Vec<u8>> {
    encrypt_chunk_with_aad(
        data_key,
        file_object_id,
        chunk_index,
        nonce,
        plaintext,
        &chunk_aad(file_object_id, chunk_index),
    )
}

fn encrypt_chunk_with_aad(
    data_key: &[u8; DATA_KEY_LEN],
    _file_object_id: i64,
    _chunk_index: u32,
    nonce: &[u8; NONCE_LEN],
    plaintext: &[u8],
    aad: &[u8],
) -> AppResult<Vec<u8>> {
    let cipher = Aes256Gcm::new_from_slice(data_key)
        .map_err(|_| AppError::Crypto("文件加密器初始化失败".to_string()))?;
    cipher
        .encrypt(
            &Nonce::from(*nonce),
            Payload {
                msg: plaintext,
                aad,
            },
        )
        .map_err(|_| AppError::Crypto("文件分块加密失败".to_string()))
}

pub fn decrypt_chunk(
    data_key: &[u8; DATA_KEY_LEN],
    file_object_id: i64,
    chunk_index: u32,
    nonce: &[u8; NONCE_LEN],
    ciphertext_with_tag: &[u8],
) -> AppResult<Vec<u8>> {
    let cipher = Aes256Gcm::new_from_slice(data_key)
        .map_err(|_| AppError::Crypto("文件解密器初始化失败".to_string()))?;
    match cipher.decrypt(
        &Nonce::from(*nonce),
        Payload {
            msg: ciphertext_with_tag,
            aad: &chunk_aad(file_object_id, chunk_index),
        },
    ) {
        Ok(plaintext) => Ok(plaintext),
        // 兼容早期 Web 上传漏写冒号分隔符的文件。
        Err(_) => cipher
            .decrypt(
                &Nonce::from(*nonce),
                Payload {
                    msg: ciphertext_with_tag,
                    aad: &legacy_chunk_aad(file_object_id, chunk_index),
                },
            )
            .map_err(|_| AppError::Crypto("文件分块解密失败或数据被篡改".to_string())),
    }
}

fn chunk_aad(file_object_id: i64, chunk_index: u32) -> Vec<u8> {
    chunk_aad_with_separator(file_object_id, chunk_index, b':')
}

fn legacy_chunk_aad(file_object_id: i64, chunk_index: u32) -> Vec<u8> {
    chunk_aad_with_separator(file_object_id, chunk_index, 0)
}

fn chunk_aad_with_separator(file_object_id: i64, chunk_index: u32, separator: u8) -> Vec<u8> {
    let mut aad = Vec::with_capacity(40);
    aad.extend_from_slice(b"yuance-file-enc:v1:");
    aad.extend_from_slice(&file_object_id.to_be_bytes());
    aad.push(separator);
    aad.extend_from_slice(&chunk_index.to_be_bytes());
    aad
}

fn random_nonces(count: u32) -> Vec<[u8; NONCE_LEN]> {
    let mut nonces = Vec::with_capacity(count as usize);
    for _ in 0..count {
        let mut nonce = [0_u8; NONCE_LEN];
        OsRng.fill_bytes(&mut nonce);
        nonces.push(nonce);
    }
    nonces
}

fn chunk_count_for(plaintext_len: usize, chunk_size: usize) -> u32 {
    if plaintext_len == 0 {
        0
    } else {
        plaintext_len.div_ceil(chunk_size) as u32
    }
}

fn encrypted_body_len(plaintext_len: usize) -> usize {
    let chunk_count = chunk_count_for(plaintext_len, FILE_CHUNK_SIZE);
    if chunk_count == 0 {
        0
    } else {
        (chunk_count as usize - 1) * (FILE_CHUNK_SIZE + TAG_LEN)
            + (chunk_plaintext_len(FILE_CHUNK_SIZE, plaintext_len as u64, chunk_count - 1)
                + TAG_LEN)
    }
}

fn verify_plaintext_sha256(plaintext: &[u8], expected: &[u8; 32]) -> AppResult<()> {
    let actual = Sha256::digest(plaintext);
    if actual[..] != expected[..] {
        return Err(AppError::Crypto("文件明文校验值不匹配".to_string()));
    }
    Ok(())
}

fn file_master_cipher(file_master_key: &str) -> AppResult<Aes256Gcm> {
    if file_master_key.trim().len() < FILE_MASTER_KEY_MIN_LEN {
        return Err(AppError::Config(
            "文件主密钥长度不能少于 16 个字符".to_string(),
        ));
    }
    let hk = Hkdf::<Sha256>::new(Some(b"yuance-file-secret"), file_master_key.as_bytes());
    let mut key = [0_u8; DATA_KEY_LEN];
    hk.expand(b"yuance-api:file-aes-256-gcm:v1", &mut key)
        .map_err(|_| AppError::Crypto("文件主密钥派生失败".to_string()))?;
    Aes256Gcm::new_from_slice(&key)
        .map_err(|_| AppError::Crypto("文件加密器初始化失败".to_string()))
}

fn read_u32(bytes: &[u8], cursor: &mut usize) -> AppResult<u32> {
    let value = bytes
        .get(*cursor..*cursor + 4)
        .ok_or_else(|| AppError::Crypto("加密文件头不完整".to_string()))?;
    *cursor += 4;
    Ok(u32::from_be_bytes(
        value.try_into().expect("length checked"),
    ))
}

fn read_u64(bytes: &[u8], cursor: &mut usize) -> AppResult<u64> {
    let value = bytes
        .get(*cursor..*cursor + 8)
        .ok_or_else(|| AppError::Crypto("加密文件头不完整".to_string()))?;
    *cursor += 8;
    Ok(u64::from_be_bytes(
        value.try_into().expect("length checked"),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    const MASTER_KEY: &str = "unit-test-file-master-key-long-enough";

    #[test]
    fn encrypt_and_decrypt_full_round_trips() {
        let data_key = generate_data_key();
        let plaintext = b"hello encrypted attachment".repeat(100);
        let ciphertext = encrypt_plaintext(&data_key, 42, &plaintext).expect("encrypt");
        assert_eq!(
            decrypt_ciphertext_full(&data_key, 42, &ciphertext).expect("decrypt"),
            plaintext
        );
    }

    #[test]
    fn encrypted_size_matches_actual_output() {
        for plaintext_len in [0, 1, 1024, FILE_CHUNK_SIZE, FILE_CHUNK_SIZE + 17] {
            let plaintext = vec![0xabu8; plaintext_len];
            let ciphertext =
                encrypt_plaintext(&generate_data_key(), 7, &plaintext).expect("encrypt");
            assert_eq!(
                ciphertext.len(),
                encrypted_total_size(plaintext_len as u64),
                "size mismatch for {plaintext_len}"
            );
        }
    }

    #[test]
    fn range_decryption_matches_full_plaintext() {
        let data_key = generate_data_key();
        let plaintext = (0..(FILE_CHUNK_SIZE * 3 + 123))
            .map(|value| (value % 251) as u8)
            .collect::<Vec<_>>();
        let ciphertext = encrypt_plaintext(&data_key, 9, &plaintext).expect("encrypt");
        for (start, end) in [
            (0, 1),
            (FILE_CHUNK_SIZE - 1, FILE_CHUNK_SIZE + 1),
            (FILE_CHUNK_SIZE, FILE_CHUNK_SIZE * 2),
            (plaintext.len() - 7, plaintext.len()),
        ] {
            let actual =
                decrypt_plaintext_range(&data_key, 9, &ciphertext, start, end).expect("range");
            assert_eq!(actual, plaintext[start..end]);
        }
    }

    #[test]
    fn body_range_decryption_matches_full_plaintext() {
        let data_key = generate_data_key();
        let file_object_id = 23_i64;
        let plaintext = (0..(FILE_CHUNK_SIZE * 2 + 77))
            .map(|value| (value % 199) as u8)
            .collect::<Vec<_>>();
        let ciphertext = encrypt_plaintext(&data_key, file_object_id, &plaintext).expect("encrypt");
        let (header, body) = parse_header(&ciphertext).expect("parse header");
        for (start, end) in [
            (0, 1),
            (FILE_CHUNK_SIZE - 3, FILE_CHUNK_SIZE + 5),
            (FILE_CHUNK_SIZE, FILE_CHUNK_SIZE * 2),
            (plaintext.len() - 9, plaintext.len()),
        ] {
            let first_chunk = (start / header.chunk_size) as u32;
            let last_chunk = ((end - 1) / header.chunk_size) as u32;
            let body_start = body_offset_for_chunk(&header, first_chunk);
            let body_end = body_offset_for_chunk(&header, last_chunk + 1);
            let actual = decrypt_body_range(
                &data_key,
                file_object_id,
                &header,
                &body[body_start..body_end],
                first_chunk,
                last_chunk + 1,
                start,
                end,
            )
            .expect("body range");
            assert_eq!(actual, plaintext[start..end]);
        }
    }

    #[test]
    fn range_decryption_rejects_tampering_and_wrong_key() {
        let data_key = generate_data_key();
        let plaintext = b"tamper target".repeat(100);
        let mut ciphertext = encrypt_plaintext(&data_key, 11, &plaintext).expect("encrypt");
        let last = ciphertext.len() - 1;
        ciphertext[last] ^= 0x01;
        assert!(decrypt_ciphertext_full(&data_key, 11, &ciphertext).is_err());

        let mut other_key = data_key;
        other_key[0] ^= 0x01;
        assert!(
            decrypt_plaintext_range(&other_key, 11, &ciphertext, 0, 64).is_err(),
            "wrong data key must fail"
        );
    }

    #[test]
    fn legacy_zero_separator_files_decrypt_with_fallback() {
        let data_key = generate_data_key();
        let file_object_id = 4242_i64;
        let plaintext = (0..(FILE_CHUNK_SIZE + 77))
            .map(|value| (value % 233) as u8)
            .collect::<Vec<_>>();
        let chunk_count = chunk_count_for(plaintext.len(), FILE_CHUNK_SIZE);
        let nonces = random_nonces(chunk_count);
        let header = build_header(&plaintext, &nonces);
        let mut ciphertext =
            Vec::with_capacity(header.len() + encrypted_body_len(plaintext.len()));
        ciphertext.extend_from_slice(&header);
        for (chunk_index, chunk) in plaintext.chunks(FILE_CHUNK_SIZE).enumerate() {
            ciphertext.extend_from_slice(
                &encrypt_chunk_with_aad(
                    &data_key,
                    file_object_id,
                    chunk_index as u32,
                    &nonces[chunk_index],
                    chunk,
                    &chunk_aad_with_separator(file_object_id, chunk_index as u32, 0),
                )
                .expect("legacy encrypt"),
            );
        }
        assert_eq!(
            decrypt_ciphertext_full(&data_key, file_object_id, &ciphertext)
                .expect("legacy decrypt"),
            plaintext
        );
    }

    #[test]
    fn data_key_envelope_round_trips_with_aad() {
        let data_key = generate_data_key();
        let aad = b"file_object:42";
        let envelope = seal_data_key(MASTER_KEY, &data_key, aad).expect("seal should succeed");
        assert!(envelope.starts_with("v1:"));
        assert_eq!(
            open_data_key(MASTER_KEY, &envelope, aad).expect("open should succeed"),
            data_key
        );
        assert!(
            open_data_key(MASTER_KEY, &envelope, b"file_object:43").is_err(),
            "wrong aad must fail"
        );
        assert!(
            open_data_key("another-key-long-enough-1234", &envelope, aad).is_err(),
            "wrong master key must fail"
        );
    }
}
