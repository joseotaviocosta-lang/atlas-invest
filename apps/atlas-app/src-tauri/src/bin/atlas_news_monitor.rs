#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use atlas_app_lib::bootstrap_config::{
    apply_clean_node_env, atlas_data_dir, atomic_write_json, PG_PORT,
};
use atlas_app_lib::lifecycle::SingleInstanceGuard;
use atlas_app_lib::pg_bootstrap::{ensure_postgres, stop_postgres_if_owned, PostgresStopOutcome};
use atlas_app_lib::runtime_manifest::{find_runtime_manifest_near_bundle, validate_runtime_manifest_file};
use atlas_app_lib::storage;
use serde::{Deserialize, Serialize};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

const EXIT_SUCCESS: i32 = 0;
const EXIT_SKIPPED: i32 = 10;
const EXIT_LOCKED: i32 = 30;
const EXIT_DEPENDENCY_FAILURE: i32 = 40;
const EXIT_UNEXPECTED: i32 = 50;
const EXIT_VERSION_MISMATCH: i32 = 60;

const MONITOR_TIMEOUT_SECS: u64 = 300;
const MAX_LOG_BYTES: u64 = 5 * 1024 * 1024;
const MONITOR_MUTEX_NAME: &str = "Local\\AtlasInvestNewsMonitorMutex";
const MONITOR_VERSION: &str = env!("CARGO_PKG_VERSION");
const ATLAS_TAURI_VERSION: &str = env!("ATLAS_TAURI_VERSION");
const ATLAS_BUILD_ID: &str = env!("ATLAS_BUILD_ID");

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct MonitorPrefsFile {
    #[serde(default)]
    closed_app_news_monitoring: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct LauncherStatusRecord {
    last_run_at: String,
    last_refreshed_at: Option<String>,
    exit_code: i32,
    status: String,
    audited_assets: u32,
    events_count: u32,
    delivered_alerts_count: u32,
    suppressed_quiet_hours_count: u32,
    started_postgres: bool,
    duration_ms: u64,
    atlas_version: String,
    monitor_version: String,
    build_id: String,
    providers_used: Vec<String>,
    official_status: Option<String>,
    cvm_status: Option<String>,
    fnet_status: Option<String>,
    error: Option<String>,
}

fn utc_iso_now() -> String {
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let days = (secs / 86400) as i64;
    let rem = secs % 86400;
    let hour = rem / 3600;
    let min = (rem % 3600) / 60;
    let sec = rem % 60;

    // Howard Hinnant's civil-from-days algorithm (UTC)
    let z = days + 719468;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = (z - era * 146097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = (yoe as i64) + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = y + if m <= 2 { 1 } else { 0 };
    format!("{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z", year, m, d, hour, min, sec)
}

fn write_launcher_failure_status(
    exit_code: i32,
    status: &str,
    user_message: &str,
    started_postgres: bool,
    duration_ms: u64,
) {
    let status_path = atlas_data_dir().join("news-monitor-status.json");
    let rec = LauncherStatusRecord {
        last_run_at: utc_iso_now(),
        last_refreshed_at: None,
        exit_code,
        status: status.to_string(),
        audited_assets: 0,
        events_count: 0,
        delivered_alerts_count: 0,
        suppressed_quiet_hours_count: 0,
        started_postgres,
        duration_ms,
        atlas_version: ATLAS_TAURI_VERSION.to_string(),
        monitor_version: MONITOR_VERSION.to_string(),
        build_id: ATLAS_BUILD_ID.to_string(),
        providers_used: Vec::new(),
        official_status: None,
        cvm_status: None,
        fnet_status: None,
        error: Some(user_message.to_string()),
    };
    let _ = atomic_write_json(&status_path, &rec);
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
    let cycle_started = Instant::now();

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
        log_line("Monitoramento com Atlas fechado desativado ou preferências inválidas (exit=10).");
        return EXIT_SKIPPED;
    }

    // Check runtime files BEFORE starting PostgreSQL (PARTE AD/AE)
    let (node_bin, monitor_bundle) = match resolve_node_and_monitor_bundle() {
        Ok(pair) => pair,
        Err(err) => {
            log_line(&format!("Dependência ausente: {}", err));
            write_launcher_failure_status(
                EXIT_DEPENDENCY_FAILURE,
                "DEPENDENCY_FAILURE",
                "Arquivos do runtime local ausentes. Reinstale ou repare o Atlas.",
                false,
                cycle_started.elapsed().as_millis() as u64,
            );
            return EXIT_DEPENDENCY_FAILURE;
        }
    };

    // Validate version & SHA-256 integrity manifest BEFORE starting PostgreSQL (PARTE G-N, AA-AB, BU-BV)
    let current_exe = std::env::current_exe()
        .map(|p| clean_path(&p))
        .unwrap_or_else(|_| PathBuf::from("atlas-news-monitor.exe"));

    let manifest = match find_runtime_manifest_near_bundle(&monitor_bundle) {
        Some(manifest_path) => match validate_runtime_manifest_file(
            &manifest_path,
            &current_exe,
            &monitor_bundle,
            &node_bin,
            MONITOR_VERSION,
            Some(ATLAS_BUILD_ID),
        ) {
            Ok(m) => m,
            Err(err) => {
                log_line(&format!("Falha de coerência/integridade do runtime (exit=60): {}", err));
                write_launcher_failure_status(
                    EXIT_VERSION_MISMATCH,
                    "RUNTIME_VERSION_MISMATCH",
                    "Incompatibilidade de versão ou integridade do runtime detectada. Reinstale ou repare o Atlas.",
                    false,
                    cycle_started.elapsed().as_millis() as u64,
                );
                return EXIT_VERSION_MISMATCH;
            }
        },
        None => {
            log_line("runtime-manifest.json não localizado próximo ao bundle (exit=60).");
            write_launcher_failure_status(
                EXIT_VERSION_MISMATCH,
                "RUNTIME_VERSION_MISMATCH",
                "Manifesto de versão do runtime ausente. Reinstale ou repare o Atlas.",
                false,
                cycle_started.elapsed().as_millis() as u64,
            );
            return EXIT_VERSION_MISMATCH;
        }
    };

    let pg_outcome = match ensure_postgres() {
        Ok(o) => o,
        Err(err) => {
            log_line(&format!("Falha ao garantir PostgreSQL na porta {}: {}", PG_PORT, err));
            write_launcher_failure_status(
                EXIT_DEPENDENCY_FAILURE,
                "DEPENDENCY_FAILURE",
                "Banco de dados local indisponível para o monitoramento.",
                false,
                cycle_started.elapsed().as_millis() as u64,
            );
            return EXIT_DEPENDENCY_FAILURE;
        }
    };

    let workdir = monitor_bundle
        .parent()
        .unwrap_or_else(|| Path::new("."));

    let brapi_token = storage::get_brapi_api_key().ok().flatten();
    let started_pg_str = if pg_outcome.started_postgres { "true" } else { "false" };

    let mut cmd = Command::new(&node_bin);
    cmd.arg(&monitor_bundle);
    cmd.current_dir(workdir);
    apply_clean_node_env(
        &mut cmd,
        false,
        brapi_token.as_deref(),
        &[
            ("ATLAS_STARTED_POSTGRES", started_pg_str),
            ("ATLAS_APP_VERSION", ATLAS_TAURI_VERSION),
            ("ATLAS_MONITOR_VERSION", MONITOR_VERSION),
            ("ATLAS_BUILD_ID", ATLAS_BUILD_ID),
            ("ATLAS_MANIFEST_BUILD_ID", &manifest.build_id),
            ("ATLAS_MANIFEST_BUNDLE_VERSION", &manifest.api_bundle_version),
        ],
    );

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
                            write_launcher_failure_status(
                                EXIT_UNEXPECTED,
                                "UNEXPECTED_FAILURE",
                                "Tempo limite de execução do monitoramento excedido.",
                                pg_outcome.started_postgres,
                                cycle_started.elapsed().as_millis() as u64,
                            );
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

    match stop_postgres_if_owned(pg_outcome) {
        Ok(PostgresStopOutcome::KeptForDesktopHandoff) => {
            log_line("PostgreSQL mantido em execução: handoff para o Atlas Desktop ativo.");
        }
        Ok(PostgresStopOutcome::Stopped) | Ok(PostgresStopOutcome::NotOwner) => {}
        Err(err) => {
            log_line(&format!("Aviso ao encerrar PostgreSQL iniciado pelo monitor: {}", err));
        }
    }

    if exit_code == 0 {
        return EXIT_SUCCESS;
    }

    exit_code
}

fn main() {
    let code = run_monitor();
    std::process::exit(code);
}
