use aes_gcm::{
    Aes256Gcm, Nonce,
    aead::{Aead, KeyInit, Payload},
};
use base64::{Engine, engine::general_purpose::STANDARD};
use hkdf::Hkdf;
use rand_core::{OsRng, RngCore};
use sha2::Sha256;

use crate::platform::error::{AppError, AppResult};

const CIPHERTEXT_PREFIX: &str = "v1";
const NONCE_LEN: usize = 12;

pub fn encrypt_secret(master_key: &str, plaintext: &str, aad: &[u8]) -> AppResult<String> {
    let cipher = cipher(master_key)?;
    let mut nonce_bytes = [0_u8; NONCE_LEN];
    OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from(nonce_bytes);
    let ciphertext = cipher
        .encrypt(
            &nonce,
            Payload {
                msg: plaintext.as_bytes(),
                aad,
            },
        )
        .map_err(|_| AppError::Crypto("加密失败".to_string()))?;

    Ok(format!(
        "{CIPHERTEXT_PREFIX}:{}:{}",
        STANDARD.encode(nonce_bytes),
        STANDARD.encode(ciphertext)
    ))
}

pub fn decrypt_secret(master_key: &str, ciphertext: &str, aad: &[u8]) -> AppResult<String> {
    let mut parts = ciphertext.splitn(3, ':');
    let version = parts.next().unwrap_or_default();
    let nonce = parts.next().unwrap_or_default();
    let payload = parts.next().unwrap_or_default();
    if version != CIPHERTEXT_PREFIX || nonce.is_empty() || payload.is_empty() {
        return Err(AppError::Crypto("密文格式无效".to_string()));
    }

    let nonce = STANDARD
        .decode(nonce)
        .map_err(|_| AppError::Crypto("密文 nonce 无效".to_string()))?;
    let nonce: [u8; NONCE_LEN] = nonce
        .try_into()
        .map_err(|_| AppError::Crypto("密文 nonce 长度无效".to_string()))?;
    let payload = STANDARD
        .decode(payload)
        .map_err(|_| AppError::Crypto("密文内容无效".to_string()))?;

    let cipher = cipher(master_key)?;
    let nonce = Nonce::from(nonce);
    let plaintext = cipher
        .decrypt(&nonce, Payload { msg: &payload, aad })
        .map_err(|_| AppError::Crypto("解密失败".to_string()))?;

    String::from_utf8(plaintext).map_err(|_| AppError::Crypto("明文不是 UTF-8".to_string()))
}

fn cipher(master_key: &str) -> AppResult<Aes256Gcm> {
    if master_key.trim().len() < 16 {
        return Err(AppError::Config(
            "YUANCE_SECURITY_MASTER_KEY 长度不能少于 16 个字符".to_string(),
        ));
    }

    let hk = Hkdf::<Sha256>::new(Some(b"yuance-storage-secret"), master_key.as_bytes());
    let mut key = [0_u8; 32];
    hk.expand(b"yuance-api:aes-256-gcm:v1", &mut key)
        .map_err(|_| AppError::Crypto("密钥派生失败".to_string()))?;

    Aes256Gcm::new_from_slice(&key).map_err(|_| AppError::Crypto("加密器初始化失败".to_string()))
}
