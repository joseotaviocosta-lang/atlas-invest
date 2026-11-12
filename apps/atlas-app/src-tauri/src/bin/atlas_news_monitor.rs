#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use atlas_app_lib::lifecycle::SingleInstanceGuard;
use atlas_app_lib::pg_bootstrap::{ensure_postgres, stop_postgres_if_owned, PG_PORT};
use atlas_app_lib::storage;
use serde::Deserialize;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

const EXIT_SUCCESS: i32 = 0;
const EXIT_SKIPPED: i32 = 10;
const EXIT_LOCKED: i32 = 30;
const EXIT_DEPENDENCY_FAILURE: i32 = 40;
const EXIT_UNEXPECTED: i32 = 50;

const MONITOR_TIMEOUT_SECS: u64 = 300; // 5 minutes max (PARTE X)
const MAX_LOG_BYTES: u64 = 5 * 1024 * 1024; // 5 MB rotation (PARTE BP)
const MONITOR_MUTEX_NAME: &str = "Local\\AtlasInvestNewsMonitorMutex";
const MONITOR_VERSION: &str = env!("CARGO_PKG_VERSION");

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct MonitorPrefsFile {
    #[serde(default)]
    closed_app_news_monitoring: bool,
}

fn atlas_data_dir() -> PathBuf {
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

fn log_line(msg: &str) {
    let logs_dir = atlas_data_dir().join("logs");
    let _ = fs::create_dir_all(&logs_dir);
    let log_path = logs_dir.join("news-monitor.log");

    if let Ok(meta) = fs::metadata(&log_path) {
        if meta.len() >= MAX_LOG_BYTES {
            let rotated = logs_dir.join("news-monitor.log.old");
            let _ = fs::remove_file(&rotated);
            let _ = fs::rename(&log_path, rotated);
        }
    }

    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(&log_path) {
        let _ = writeln!(file, "[atlas-news-monitor] {}", msg);
    }
}

#[cfg(target_os = "windows")]
fn acquire_monitor_mutex() -> Result<Option<SingleInstanceGuard>, String> {
    use atlas_app_lib::lifecycle::win32::{to_wide_null, CloseHandle, CreateMutexW, GetLastError, ERROR_ALREADY_EXISTS};

    let wide = to_wide_null(MONITOR_MUTEX_NAME);
    let handle = unsafe { CreateMutexW(std::ptr::null_mut(), 0, wide.as_ptr()) };
    if handle.is_null() {
        return Err("Falha ao criar mutex exclusivo do atlas-news-monitor".to_string());
    }
    let err = unsafe { GetLastError() };
    if err == ERROR_ALREADY_EXISTS {
        unsafe { CloseHandle(handle) };
        return Ok(None);
    }
    Ok(Some(SingleInstanceGuard::from_handle(handle)))
}

#[cfg(not(target_os = "windows"))]
fn acquire_monitor_mutex() -> Result<Option<SingleInstanceGuard>, String> {
    Ok(Some(SingleInstanceGuard::new()))
}

fn clean_path(path: &Path) -> PathBuf {
    let s = path.to_string_lossy();
    if let Some(stripped) = s.strip_prefix(r"\\?\") {
        PathBuf::from(stripped)
    } else {
        path.to_path_buf()
    }
}

fn resolve_node_and_monitor_bundle() -> Result<(PathBuf, PathBuf), String> {
    let mut searched = Vec::new();

    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            let candidates = [
                (
                    exe_dir.join("node.exe"),
                    exe_dir.join("api").join("news-monitor.cjs"),
                ),
                (
                    exe_dir.join("_up_").join("runtime").join("node.exe"),
                    exe_dir
                        .join("_up_")
                        .join("runtime")
                        .join("api")
                        .join("news-monitor.cjs"),
                ),
                (
                    exe_dir.join("runtime").join("node.exe"),
                    exe_dir.join("runtime").join("api").join("news-monitor.cjs"),
                ),
            ];
            for (n, m) in candidates {
                searched.push(format!("{:?} / {:?}", n, m));
                if n.exists() && m.exists() {
                    return Ok((clean_path(&n), clean_path(&m)));
                }
            }
        }
    }

    let data_runtime = atlas_data_dir().join("_up_").join("runtime");
    let installed_pair = (
        data_runtime.join("node.exe"),
        data_runtime.join("api").join("news-monitor.cjs"),
    );
    searched.push(format!("{:?} / {:?}", installed_pair.0, installed_pair.1));
    if installed_pair.0.exists() && installed_pair.1.exists() {
        return Ok((clean_path(&installed_pair.0), clean_path(&installed_pair.1)));
    }

    let dev_pair = (
        PathBuf::from(r"C:\Projetos\atlas-invest\apps\atlas-app\runtime\node.exe"),
        PathBuf::from(r"C:\Projetos\atlas-invest\apps\atlas-app\runtime\api\news-monitor.cjs"),
    );
    searched.push(format!("{:?} / {:?}", dev_pair.0, dev_pair.1));
    if dev_pair.0.exists() && dev_pair.1.exists() {
        return Ok(dev_pair);
    }

    Err(format!(
        "Runtime do monitor não encontrado. Caminhos verificados: {}",
        searched.join(" | ")
    ))
}

fn is_closed_app_opt_in_enabled() -> bool {
    let prefs_path = atlas_data_dir().join("news-monitor-prefs.json");
    let Ok(raw) = fs::read_to_string(prefs_path) else {
        return false;
    };
    serde_json::from_str::<MonitorPrefsFile>(&raw)
        .map(|p| p.closed_app_news_monitoring)
        .unwrap_or(false)
}

fn run_monitor() -> i32 {
    // Reject unexpected external credential/ID CLI arguments (PARTE K)
    for arg in std::env::args().skip(1) {
        let lower = arg.to_lowercase();
        if lower.contains("portfolio")
            || lower.contains("userid")
            || lower.contains("token")
            || lower.contains("brapi")
        {
            log_line("Argumento de linha de comando não permitido rejeitado por política de segurança.");
            return EXIT_UNEXPECTED;
        }
    }

    let _mutex_guard = match acquire_monitor_mutex() {
        Ok(Some(g)) => g,
        Ok(None) => {
            log_line("Ciclo ignorado: outra instância de atlas-news-monitor já está ativa (exit=30).");
            return EXIT_LOCKED;
        }
        Err(err) => {
            log_line(&format!("Falha ao adquirir lock exclusivo: {}", err));
            return EXIT_DEPENDENCY_FAILURE;
        }
    };

    if !is_closed_app_opt_in_enabled() {
        log_line("Monitoramento com Atlas fechado desativado nas preferências (exit=10).");
        return EXIT_SKIPPED;
    }

    let (node_bin, monitor_bundle) = match resolve_node_and_monitor_bundle() {
        Ok(pair) => pair,
        Err(err) => {
            log_line(&format!("Dependência ausente: {}", err));
            return EXIT_DEPENDENCY_FAILURE;
        }
    };

    let pg_outcome = match ensure_postgres() {
        Ok(o) => o,
        Err(err) => {
            log_line(&format!("Falha ao garantir PostgreSQL na porta {}: {}", PG_PORT, err));
            return EXIT_DEPENDENCY_FAILURE;
        }
    };

    let workdir = monitor_bundle
        .parent()
        .unwrap_or_else(|| Path::new("."));

    let mut cmd = Command::new(&node_bin);
    cmd.arg(&monitor_bundle);
    cmd.current_dir(workdir);
    cmd.env("NODE_ENV", "production");
    cmd.env("ATLAS_LOCAL_OWNER_MODE", "true");
    cmd.env("EMAIL_PROVIDER", "CONSOLE");
    cmd.env(
        "DATABASE_URL",
        format!(
            "postgresql://atlas:atlas@127.0.0.1:{}/atlas_local?schema=public",
            PG_PORT
        ),
    );
    cmd.env(
        "JWT_ACCESS_SECRET",
        "atlas-desktop-local-owner-jwt-access-secret-production-32chars",
    );
    cmd.env(
        "REFRESH_TOKEN_PEPPER",
        "atlas-desktop-local-owner-refresh-pepper-production-32chars",
    );
    cmd.env(
        "PASSWORD_RESET_PEPPER",
        "atlas-desktop-local-owner-reset-pepper-production-32chars",
    );
    cmd.env(
        "ATLAS_STARTED_POSTGRES",
        if pg_outcome.started_postgres { "true" } else { "false" },
    );
    cmd.env("ATLAS_APP_VERSION", MONITOR_VERSION);
    cmd.env("ATLAS_MONITOR_VERSION", MONITOR_VERSION);

    if let Ok(Some(token)) = storage::get_brapi_api_key() {
        cmd.env("BRAPI_API_KEY", token);
    }

    cmd.stdin(Stdio::null());
    cmd.stdout(Stdio::null());
    cmd.stderr(Stdio::null());

    #[cfg(target_os = "windows")]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let exit_code = match cmd.spawn() {
        Ok(mut child) => {
            let started_at = Instant::now();
            loop {
                match child.try_wait() {
                    Ok(Some(status)) => {
                        break status.code().unwrap_or(EXIT_UNEXPECTED);
                    }
                    Ok(None) => {
                        if started_at.elapsed() >= Duration::from_secs(MONITOR_TIMEOUT_SECS) {
                            log_line("Timeout de 5 minutos atingido; encerrando processo monitor filho (exit=50).");
                            let _ = child.kill();
                            let _ = child.wait();
                            break EXIT_UNEXPECTED;
                        }
                        std::thread::sleep(Duration::from_millis(250));
                    }
                    Err(err) => {
                        log_line(&format!("Erro aguardando processo monitor filho: {}", err));
                        let _ = child.kill();
                        let _ = child.wait();
                        break EXIT_UNEXPECTED;
                    }
                }
            }
        }
        Err(err) => {
            log_line(&format!("Falha ao iniciar node.exe monitor: {}", err));
            EXIT_DEPENDENCY_FAILURE
        }
    };

    if let Err(err) = stop_postgres_if_owned(pg_outcome.started_postgres) {
        log_line(&format!("Aviso ao encerrar PostgreSQL iniciado pelo monitor: {}", err));
    }

    if exit_code == 0 {
        // Keep exit 0 semantic
        return EXIT_SUCCESS;
    }

    exit_code
}

fn main() {
    let code = run_monitor();
    std::process::exit(code);
}
