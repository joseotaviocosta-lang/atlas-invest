use std::process::Command;

fn read_tauri_version() -> String {
    if let Ok(raw) = std::fs::read_to_string("tauri.conf.json") {
        if let Some(pos) = raw.find("\"version\"") {
            if let Some(colon) = raw[pos..].find(':') {
                let rest = &raw[pos + colon + 1..];
                if let Some(q1) = rest.find('"') {
                    if let Some(q2) = rest[q1 + 1..].find('"') {
                        return rest[q1 + 1..q1 + 1 + q2].to_string();
                    }
                }
            }
        }
    }
    env!("CARGO_PKG_VERSION").to_string()
}

fn read_git_short_sha() -> String {
    Command::new("git")
        .args(["rev-parse", "--short=12", "HEAD"])
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "unknown".to_string())
}

fn main() {
    println!("cargo:rerun-if-env-changed=ATLAS_BUILD_ID");
    println!("cargo:rerun-if-changed=tauri.conf.json");

    let tauri_version = read_tauri_version();
    let build_id = std::env::var("ATLAS_BUILD_ID")
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| format!("{}+{}", tauri_version, read_git_short_sha()));

    println!("cargo:rustc-env=ATLAS_TAURI_VERSION={}", tauri_version);
    println!("cargo:rustc-env=ATLAS_BUILD_ID={}", build_id);

    tauri_build::build()
}
