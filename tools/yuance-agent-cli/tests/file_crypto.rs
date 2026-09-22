use std::{fs, io::Write, path::PathBuf};

use aes_gcm::{
    Aes256Gcm, Nonce,
    aead::{Aead, KeyInit, Payload},
};
use futures_util::StreamExt;
use sha2::{Digest, Sha256};
use yuance_agent::file_crypto::{EncryptedFileStream, FILE_CHUNK_SIZE, hash_file};

#[tokio::test]
async fn encrypts_empty_single_and_multi_chunk_files_with_compatible_layout() {
    for contents in [
        Vec::new(),
        vec![b'a'; FILE_CHUNK_SIZE],
        [vec![b'b'; FILE_CHUNK_SIZE], vec![b'c'; 37]].concat(),
    ] {
        let path = fixture_path(contents.len());
        fs::write(&path, &contents).unwrap();
        let digest = hash_file(&path).unwrap();
        let key = [7_u8; 32];
        let mut stream = EncryptedFileStream::open(path.clone(), 42, key, &digest).unwrap();
        let encrypted = collect_stream(&mut stream).await;
        let encrypted_digest = stream.digest().encrypted_sha256().unwrap();
        assert_eq!(encrypted_digest, hex::encode(Sha256::digest(&encrypted)));
        assert_eq!(
            u64::try_from(encrypted.len()).unwrap(),
            encrypted.len() as u64
        );
        assert_eq!(decrypt_fixture(&encrypted, key, 42), contents);
        fs::remove_file(path).unwrap();
    }
}

#[tokio::test]
async fn stops_when_source_file_changes_during_encryption() {
    let path = fixture_path(32);
    fs::write(&path, vec![b'x'; 32]).unwrap();
    let digest = hash_file(&path).unwrap();
    let mut stream = EncryptedFileStream::open(path.clone(), 42, [9_u8; 32], &digest).unwrap();
    let _ = stream
        .next()
        .await
        .expect("header should be emitted")
        .unwrap();
    let mut file = fs::OpenOptions::new().append(true).open(&path).unwrap();
    file.write_all(b"changed").unwrap();
    while let Some(item) = stream.next().await {
        if item.is_err() {
            fs::remove_file(path).unwrap();
            return;
        }
    }
    panic!("source change should fail the stream");
}

async fn collect_stream(stream: &mut EncryptedFileStream) -> Vec<u8> {
    let mut output = Vec::new();
    while let Some(item) = stream.next().await {
        output.extend_from_slice(&item.unwrap());
    }
    output
}

fn decrypt_fixture(ciphertext: &[u8], key: [u8; 32], file_object_id: i64) -> Vec<u8> {
    let mut cursor = 13;
    assert_eq!(&ciphertext[..cursor], b"YUANCE-ENC-v1");
    assert_eq!(
        u32::from_be_bytes(ciphertext[cursor..cursor + 4].try_into().unwrap()),
        1
    );
    cursor += 4;
    let chunk_size =
        u32::from_be_bytes(ciphertext[cursor..cursor + 4].try_into().unwrap()) as usize;
    cursor += 4;
    let plaintext_size =
        u64::from_be_bytes(ciphertext[cursor..cursor + 8].try_into().unwrap()) as usize;
    cursor += 8;
    let expected_sha = ciphertext[cursor..cursor + 32].to_vec();
    cursor += 32;
    let chunk_count =
        u32::from_be_bytes(ciphertext[cursor..cursor + 4].try_into().unwrap()) as usize;
    cursor += 4;
    let nonces = &ciphertext[cursor..cursor + chunk_count * 12];
    cursor += chunk_count * 12;
    let cipher = Aes256Gcm::new_from_slice(&key).unwrap();
    let mut plaintext = Vec::with_capacity(plaintext_size);
    for index in 0..chunk_count {
        let length = (plaintext_size - index * chunk_size).min(chunk_size);
        let body = &ciphertext[cursor..cursor + length + 16];
        let mut aad = b"yuance-file-enc:v1:".to_vec();
        aad.extend_from_slice(&(file_object_id as u64).to_be_bytes());
        aad.push(b':');
        aad.extend_from_slice(&(index as u32).to_be_bytes());
        plaintext.extend_from_slice(
            &cipher
                .decrypt(
                    &Nonce::from(
                        <[u8; 12]>::try_from(&nonces[index * 12..(index + 1) * 12]).unwrap(),
                    ),
                    Payload {
                        msg: body,
                        aad: &aad,
                    },
                )
                .unwrap(),
        );
        cursor += length + 16;
    }
    let actual_sha = Sha256::digest(&plaintext);
    assert_eq!(&actual_sha[..], expected_sha.as_slice());
    plaintext
}

fn fixture_path(size: usize) -> PathBuf {
    std::env::temp_dir().join(format!(
        "yuance-agent-file-{}-{size}.bin",
        std::process::id()
    ))
}
