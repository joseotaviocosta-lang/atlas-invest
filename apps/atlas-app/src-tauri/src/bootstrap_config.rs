use serde::Serialize;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::Command;

pub const PG_PORT: u16 = 5434;
pub const API_PORT: u16 = 3001;
pub const SCHEMA_EXPECTED_MIGRATIONS: u32 = 50;

/// Single source of truth for local Desktop & closed-app monitor bootstrap constants.
/// Eliminates duplication between `runtime.rs` and `atlas_news_monitor.rs`.
pub struct DesktopLocalRuntimeConfig;

impl DesktopLocalRuntimeConfig {
    pub const ATLAS_LOCAL_OWNER_MODE: &'static str = "true";
    pub const NODE_ENV: &'static str = "production";
    pub const EMAIL_PROVIDER: &'static str = "CONSOLE";
    pub const JWT_ACCESS_SECRET: &'static str =
        "atlas-desktop-local-owner-jwt-access-secret-production-32chars";
    pub const REFRESH_TOKEN_PEPPER: &'static str =
        "atlas-desktop-local-owner-refresh-pepper-production-32chars";
    pub const PASSWORD_RESET_PEPPER: &'static str =
        "atlas-desktop-local-owner-reset-pepper-production-32chars";

    pub fn local_database_url() -> String {
        format!(
            "postgresql://atlas:atlas@127.0.0.1:{}/atlas_local?schema=public",
            PG_PORT
        )
    }
}

/// Minimal Windows/system environment variables required for Node.js, Prisma, and WinRT child processes.
const SAFE_SYSTEM_ENV_ALLOWLIST: &[&str] = &[
    "SYSTEMROOT",
    "COMSPEC",
    "WINDIR",
    "TEMP",
    "TMP",
    "LOCALAPPDATA",
    "APPDATA",
    "USERPROFILE",
    "HOMEDRIVE",
    "HOMEPATH",
    "PATH",
    "PATHEXT",
    "OS",
    "PROCESSOR_ARCHITECTURE",
    "NUMBER_OF_PROCESSORS",
    "PROGRAMFILES",
    "PROGRAMFILES(X86)",
    "COMMONPROGRAMFILES",
];

/// Applies a clean, minimal environment to child Node.js processes instead of inheriting
/// unrelated ambient environment variables.
pub fn apply_clean_node_env(
    cmd: &mut Command,
    include_port: bool,
    brapi_token: Option<&str>,
    extra_vars: &[(&str, &str)],
) {
    cmd.env_clear();

    for key in SAFE_SYSTEM_ENV_ALLOWLIST {
        if let Ok(val) = std::env::var(key) {
            if !val.is_empty() {
                cmd.env(key, val);
            }
        }
    }

    if include_port {
        cmd.env("PORT", API_PORT.to_string());
    }

    cmd.env("NODE_ENV", DesktopLocalRuntimeConfig::NODE_ENV);
    cmd.env(
        "ATLAS_LOCAL_OWNER_MODE",
        DesktopLocalRuntimeConfig::ATLAS_LOCAL_OWNER_MODE,
    );
    cmd.env("EMAIL_PROVIDER", DesktopLocalRuntimeConfig::EMAIL_PROVIDER);
    cmd.env(
        "DATABASE_URL",
        DesktopLocalRuntimeConfig::local_database_url(),
    );
    cmd.env(
        "JWT_ACCESS_SECRET",
        DesktopLocalRuntimeConfig::JWT_ACCESS_SECRET,
    );
    cmd.env(
        "REFRESH_TOKEN_PEPPER",
        DesktopLocalRuntimeConfig::REFRESH_TOKEN_PEPPER,
    );
    cmd.env(
        "PASSWORD_RESET_PEPPER",
        DesktopLocalRuntimeConfig::PASSWORD_RESET_PEPPER,
    );

    if let Some(token) = brapi_token.map(str::trim).filter(|t| !t.is_empty()) {
        cmd.env("BRAPI_API_KEY", token);
    }

    for (k, v) in extra_vars {
        cmd.env(k, v);
    }
}

pub fn atlas_data_dir() -> PathBuf {
    if let Ok(localappdata) = std::env::var("LOCALAPPDATA") {
        return PathBuf::from(localappdata).join("Atlas");
    }
    if let Ok(userprofile) = std::env::var("USERPROFILE") {
        return PathBuf::from(userprofile)
            .join("AppData")
            .join("Local")
            .join("Atlas");
    }
    PathBuf::from(r"C:\Users\joseo\AppData\Local\Atlas")
}

/// Atomically writes bytes to `target` using write-to-temp + flush/sync + rename.
pub fn atomic_write_bytes(target: &Path, bytes: &[u8]) -> Result<(), String> {
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Falha ao criar diretório {:?}: {}", parent, e))?;
    }

    let file_name = target
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("atlas-file");
    let temp_path = target.with_file_name(format!(".{}.tmp.{}", file_name, std::process::id()));

    {
        let mut file = OpenOptions::new()
            .create(true)
            .write(true)
            .truncate(true)
            .open(&temp_path)
            .map_err(|e| format!("Falha ao abrir arquivo temporário {:?}: {}", temp_path, e))?;
        file.write_all(bytes)
            .map_err(|e| format!("Falha ao gravar arquivo temporário {:?}: {}", temp_path, e))?;
        file.sync_all()
            .map_err(|e| format!("Falha ao sincronizar arquivo temporário {:?}: {}", temp_path, e))?;
    }

    if let Err(err) = fs::rename(&temp_path, target) {
        let _ = fs::remove_file(&temp_path);
        return Err(format!(
            "Falha ao substituir atomicamente {:?}: {}",
            target, err
        ));
    }

    Ok(())
}

pub fn atomic_write_json<T: Serialize>(target: &Path, value: &T) -> Result<(), String> {
    let serialized = serde_json::to_vec_pretty(value)
        .map_err(|e| format!("Falha ao serializar JSON: {}", e))?;
    atomic_write_bytes(target, &serialized)
}

#[cfg(test)]
mod tests {
    use super::{apply_clean_node_env, atomic_write_bytes, DesktopLocalRuntimeConfig};
    use std::process::Command;

    #[test]
    fn bootstrap_contract_exposes_canonical_local_database_url() {
        assert_eq!(
            DesktopLocalRuntimeConfig::local_database_url(),
            "postgresql://atlas:atlas@127.0.0.1:5434/atlas_local?schema=public"
        );
    }

    #[test]
    fn clean_env_excludes_unrelated_ambient_secrets() {
        std::env::set_var("ATLAS_UNRELATED_TEST_VAR", "should-not-leak");
        let mut cmd = Command::new("cmd.exe");
        apply_clean_node_env(&mut cmd, false, Some("brapi-test-123"), &[]);
        let envs: std::collections::HashMap<_, _> = cmd
            .get_envs()
            .filter_map(|(k, v)| Some((k.to_string_lossy().to_string(), v?.to_string_lossy().to_string())))
            .collect();
        assert!(!envs.contains_key("ATLAS_UNRELATED_TEST_VAR"));
        assert_eq!(
            envs.get("DATABASE_URL").map(String::as_str),
            Some("postgresql://atlas:atlas@127.0.0.1:5434/atlas_local?schema=public")
        );
        assert_eq!(envs.get("BRAPI_API_KEY").map(String::as_str), Some("brapi-test-123"));
        std::env::remove_var("ATLAS_UNRELATED_TEST_VAR");
    }

    #[test]
    fn atomic_write_replaces_target_cleanly() {
        let temp_dir = std::env::temp_dir().join(format!("atlas-atomic-test-{}", std::process::id()));
        let _ = std::fs::create_dir_all(&temp_dir);
        let target = temp_dir.join("prefs.json");
        atomic_write_bytes(&target, br#"{"v":1}"#).unwrap();
        atomic_write_bytes(&target, br#"{"v":2}"#).unwrap();
        let content = std::fs::read_to_string(&target).unwrap();
        assert_eq!(content, r#"{"v":2}"#);
        let _ = std::fs::remove_dir_all(&temp_dir);
    }
}
