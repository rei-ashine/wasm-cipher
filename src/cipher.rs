use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm,
    Nonce, // 12-bytes nonce
};
use base64::{engine::general_purpose, Engine as _};
use pbkdf2::pbkdf2_hmac;
use sha2::Sha256;

const PBKDF2_ITERATIONS: u32 = 100_000;
const SALT_SIZE: usize = 16;
const NONCE_SIZE: usize = 12;
const KEY_SIZE: usize = 32;

pub fn encrypt(password: &str, data: &str) -> Result<String, String> {
    let salt = gen_salt()?;
    let nonce_bytes = gen_nonce()?;
    seal(password, data, &salt, &nonce_bytes)
}

// Encrypts with the given salt and nonce. Split from encrypt() so tests can
// check the output against known-answer vectors.
fn seal(password: &str, data: &str, salt: &[u8], nonce_bytes: &[u8]) -> Result<String, String> {
    let key_bytes = derive_key(password, salt)?;

    let cipher = Aes256Gcm::new_from_slice(&key_bytes).map_err(|_| "Invalid key length")?;
    let nonce = Nonce::try_from(nonce_bytes).map_err(|_| "Invalid nonce length")?;

    let ciphertext = cipher
        .encrypt(&nonce, data.as_bytes())
        .map_err(|_| "Encryption failed")?;

    let mut result = Vec::new();
    result.extend_from_slice(salt);
    result.extend_from_slice(nonce_bytes);
    result.extend_from_slice(&ciphertext);

    Ok(general_purpose::STANDARD.encode(result))
}

fn gen_salt() -> Result<Vec<u8>, String> {
    let mut salt = vec![0u8; SALT_SIZE];
    getrandom::fill(&mut salt).map_err(|_| "Failed to generate salt")?;
    Ok(salt)
}

fn gen_nonce() -> Result<Vec<u8>, String> {
    let mut nonce = vec![0u8; NONCE_SIZE];
    getrandom::fill(&mut nonce).map_err(|_| "Failed to generate nonce")?;
    Ok(nonce)
}

fn derive_key(password: &str, salt: &[u8]) -> Result<Vec<u8>, String> {
    let mut key = vec![0u8; KEY_SIZE];
    pbkdf2_hmac::<Sha256>(password.as_bytes(), salt, PBKDF2_ITERATIONS, &mut key);
    Ok(key)
}

pub fn decrypt(password: &str, data: &str) -> Result<String, String> {
    let bytes = general_purpose::STANDARD
        .decode(data)
        .map_err(|_| "Invalid base64 encoding")?;

    if bytes.len() < SALT_SIZE + NONCE_SIZE {
        return Err("Invalid ciphertext: too short".to_string());
    }

    let salt = &bytes[..SALT_SIZE];
    let nonce_bytes = &bytes[SALT_SIZE..SALT_SIZE + NONCE_SIZE];
    let ciphertext = &bytes[SALT_SIZE + NONCE_SIZE..];

    let key_bytes = derive_key(password, salt)?;

    let cipher = Aes256Gcm::new_from_slice(&key_bytes).map_err(|_| "Invalid key length")?;
    let nonce = Nonce::try_from(nonce_bytes).map_err(|_| "Invalid nonce length")?;

    let plaintext = cipher
        .decrypt(&nonce, ciphertext)
        .map_err(|_| "Decryption failed - wrong password or corrupted data")?;

    String::from_utf8(plaintext).map_err(|_| "Invalid UTF-8 in decrypted data".to_string())
}

#[cfg(test)]
mod test_cipher {
    use super::*;

    // AES-GCM authentication tag appended to the ciphertext
    const TAG_SIZE: usize = 16;

    #[test]
    fn test_enc_dec() {
        let password = "abcd";
        let data = "With great power comes great responsibility.";

        let enc = encrypt(password, data).expect("Encryption should succeed");
        println!("Encryption: {}", enc);

        let dec = decrypt(password, &enc).expect("Decryption should succeed");
        println!("Decryption: {}", dec);

        assert_eq!(data, dec);
    }

    #[test]
    fn test_wrong_password() {
        let password = "correct_password";
        let wrong_password = "wrong_password";
        let data = "Secret message";

        let enc = encrypt(password, data).expect("Encryption should succeed");
        let result = decrypt(wrong_password, &enc);

        assert!(
            result.is_err(),
            "Decryption with wrong password should fail"
        );
    }

    #[test]
    fn test_invalid_base64() {
        let password = "password";
        let invalid_data = "invalid_base64!";

        let result = decrypt(password, invalid_data);
        assert!(result.is_err(), "Decryption of invalid base64 should fail");
    }

    // Known-answer vectors made with an independent implementation: Python
    // cryptography 50.0.1 (OpenSSL 3.0.13), PBKDF2-HMAC-SHA256 with 100,000
    // iterations, AES-256-GCM, output base64(salt || nonce || ciphertext ||
    // tag). They also guard decryption of ciphertexts users already saved:
    // any change to the format or parameters makes these tests fail.
    const KAT_SALT: [u8; SALT_SIZE] = [
        0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e,
        0x0f,
    ];
    const KAT_NONCE: [u8; NONCE_SIZE] = [
        0xa0, 0xa1, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 0xab,
    ];
    // (password, plaintext, expected output)
    const KAT_VECTORS: [(&str, &str, &str); 3] = [
        (
            "abcd",
            "With great power comes great responsibility.",
            "AAECAwQFBgcICQoLDA0OD6ChoqOkpaanqKmqq/JDunALDD0R17H2xpgerREdIJT0p6uKG9HngpfX9CzQ1TKrEBKUzJNykWjXwDpdsukDxkwGKAdLVZ+Qvg==",
        ),
        (
            "パスワード",
            "大いなる力には大いなる責任が伴う🕷️",
            "AAECAwQFBgcICQoLDA0OD6ChoqOkpaanqKmqq9PsJ0hVIywwlSUmstX3GkKP2XFpRTxp0w0d8dtCJOBCKvgT5Nlrwgm2beyi96674DNYXN5Q6rQXQ8MLQyoZMkanh1yXV2EX",
        ),
        (
            "abcd",
            "",
            "AAECAwQFBgcICQoLDA0OD6ChoqOkpaanqKmqqzBd1KyfGl/kkzoNkZCPTkk=",
        ),
    ];
    // The bytes ff fe, which are not valid UTF-8, encrypted with "abcd"
    const KAT_INVALID_UTF8: &str =
        "AAECAwQFBgcICQoLDA0OD6ChoqOkpaanqKmqq1rUjYWj/jXWxjH8gnDVdXGj1g==";

    #[test]
    fn test_known_answer_encrypt() {
        for (password, plaintext, expected) in KAT_VECTORS {
            let enc = seal(password, plaintext, &KAT_SALT, &KAT_NONCE).unwrap();
            assert_eq!(enc, expected, "plaintext {plaintext:?}");
        }
    }

    #[test]
    fn test_known_answer_decrypt() {
        for (password, plaintext, expected) in KAT_VECTORS {
            assert_eq!(decrypt(password, expected).unwrap(), plaintext);
        }
    }

    #[test]
    fn test_invalid_utf8_plaintext() {
        let err = decrypt("abcd", KAT_INVALID_UTF8).unwrap_err();
        assert!(err.contains("UTF-8"), "{err}");
    }

    #[test]
    fn test_random_salt_and_nonce() {
        let a = encrypt("abcd", "same input").unwrap();
        let b = encrypt("abcd", "same input").unwrap();
        assert_eq!(decrypt("abcd", &a).unwrap(), "same input");
        assert_eq!(decrypt("abcd", &b).unwrap(), "same input");

        // Compare each part separately, so a fixed salt or a fixed nonce is
        // caught even while the other one still varies
        let a = general_purpose::STANDARD.decode(a).unwrap();
        let b = general_purpose::STANDARD.decode(b).unwrap();
        let salt = ..SALT_SIZE;
        let nonce = SALT_SIZE..SALT_SIZE + NONCE_SIZE;
        assert_ne!(a[salt], b[salt], "salt must be random per encryption");
        assert_ne!(
            a[nonce.clone()],
            b[nonce],
            "nonce must be random per encryption"
        );
    }

    #[test]
    fn test_output_layout() {
        let data = "日本語とemoji 🔐";
        let bytes = general_purpose::STANDARD
            .decode(encrypt("abcd", data).unwrap())
            .unwrap();
        assert_eq!(bytes.len(), SALT_SIZE + NONCE_SIZE + data.len() + TAG_SIZE);
    }

    #[test]
    fn test_tampering_is_detected() {
        let bytes = general_purpose::STANDARD.decode(KAT_VECTORS[0].2).unwrap();
        let tag_start = bytes.len() - TAG_SIZE;
        // One bit in each of salt, nonce, ciphertext body and tag
        for index in [0, SALT_SIZE, SALT_SIZE + NONCE_SIZE, tag_start] {
            let mut tampered = bytes.clone();
            tampered[index] ^= 0x01;
            let input = general_purpose::STANDARD.encode(&tampered);
            assert!(decrypt("abcd", &input).is_err(), "flipped byte {index}");
        }
        let truncated = general_purpose::STANDARD.encode(&bytes[..bytes.len() - 1]);
        assert!(decrypt("abcd", &truncated).is_err(), "truncated");
        let mut extended = bytes.clone();
        extended.push(0);
        let extended = general_purpose::STANDARD.encode(&extended);
        assert!(decrypt("abcd", &extended).is_err(), "extended");
    }

    #[test]
    fn test_short_input() {
        let encode = |len: usize| general_purpose::STANDARD.encode(vec![0u8; len]);
        let err = decrypt("abcd", &encode(SALT_SIZE + NONCE_SIZE - 1)).unwrap_err();
        assert!(err.contains("too short"), "{err}");
        // Long enough to split, but shorter than the tag requires
        for len in [
            SALT_SIZE + NONCE_SIZE,
            SALT_SIZE + NONCE_SIZE + TAG_SIZE - 1,
        ] {
            assert!(decrypt("abcd", &encode(len)).is_err(), "length {len}");
        }
    }
}
