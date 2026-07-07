use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce // 12-bytes nonce
};
use pbkdf2::pbkdf2_hmac;
use sha2::Sha256;
use base64::{Engine as _, engine::general_purpose};

const PBKDF2_ITERATIONS: u32 = 100_000;
const SALT_SIZE: usize = 16;
const NONCE_SIZE: usize = 12;
const KEY_SIZE: usize = 32;

pub fn encrypt(password: &str, data: &str) -> Result<String, String> {
    let salt = gen_salt()?;
    let key_bytes = derive_key(password, &salt)?;
    let nonce_bytes = gen_nonce()?;

    let cipher = Aes256Gcm::new_from_slice(&key_bytes).map_err(|_| "Invalid key length")?;
    let nonce = Nonce::try_from(nonce_bytes.as_slice()).map_err(|_| "Invalid nonce length")?;

    let ciphertext = cipher.encrypt(&nonce, data.as_bytes())
        .map_err(|_| "Encryption failed")?;

    let mut result = Vec::new();
    result.extend_from_slice(&salt);
    result.extend_from_slice(&nonce_bytes);
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
    let bytes = general_purpose::STANDARD.decode(data)
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

    let plaintext = cipher.decrypt(&nonce, ciphertext)
        .map_err(|_| "Decryption failed - wrong password or corrupted data")?;

    String::from_utf8(plaintext)
        .map_err(|_| "Invalid UTF-8 in decrypted data".to_string())
}

#[cfg(test)]
mod test_cipher {
    use super::*;
    
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
        
        assert!(result.is_err(), "Decryption with wrong password should fail");
    }

    #[test]
    fn test_invalid_base64() {
        let password = "password";
        let invalid_data = "invalid_base64!";
        
        let result = decrypt(password, invalid_data);
        assert!(result.is_err(), "Decryption of invalid base64 should fail");
    }
}
