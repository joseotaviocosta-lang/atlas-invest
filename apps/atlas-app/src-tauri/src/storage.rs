#[cfg(not(target_os = "android"))]
use keyring::Entry;

pub const SERVICE_NAME: &str = "Project Atlas";
pub const REFRESH_TOKEN_ACCOUNT: &str = "refresh-token";

#[cfg(not(target_os = "android"))]
pub fn get_refresh_token() -> Result<Option<String>, String> {
    let entry = Entry::new(SERVICE_NAME, REFRESH_TOKEN_ACCOUNT)
        .map_err(|e| format!("Failed to access credential store: {}", e))?;

    match entry.get_password() {
        Ok(password) => Ok(Some(password)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("Failed to retrieve refresh token: {}", e)),
    }
}

#[cfg(target_os = "android")]
pub fn get_refresh_token() -> Result<Option<String>, String> {
    // Phase APP-9: Android Keystore integration scheduled for APP-10.
    // Transient session only, no plaintext persistence.
    Ok(None)
}

#[cfg(not(target_os = "android"))]
pub fn set_refresh_token(token: &str) -> Result<(), String> {
    if token.trim().is_empty() {
        return Err("Cannot persist empty refresh token".to_string());
    }

    let entry = Entry::new(SERVICE_NAME, REFRESH_TOKEN_ACCOUNT)
        .map_err(|e| format!("Failed to access credential store: {}", e))?;

    entry
        .set_password(token)
        .map_err(|e| format!("Failed to store refresh token: {}", e))?;

    Ok(())
}

#[cfg(target_os = "android")]
pub fn set_refresh_token(_token: &str) -> Result<(), String> {
    // Phase APP-9: Android Keystore integration scheduled for APP-10.
    Ok(())
}

#[cfg(not(target_os = "android"))]
pub fn clear_refresh_token() -> Result<(), String> {
    let entry = Entry::new(SERVICE_NAME, REFRESH_TOKEN_ACCOUNT)
        .map_err(|e| format!("Failed to access credential store: {}", e))?;

    match entry.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("Failed to clear refresh token: {}", e)),
    }
}

#[cfg(target_os = "android")]
pub fn clear_refresh_token() -> Result<(), String> {
    Ok(())
}
