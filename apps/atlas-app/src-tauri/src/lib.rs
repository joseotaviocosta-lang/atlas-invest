pub mod lifecycle;
pub mod pg_bootstrap;
pub mod runtime;
pub mod storage;
pub mod task_scheduler;

use std::sync::Arc;
use tauri::Manager;
use runtime::{LocalRuntimeManager, RuntimeStatus};

#[tauri::command]
fn storage_get_refresh_token() -> Result<Option<String>, String> {
    storage::get_refresh_token()
}

#[tauri::command]
fn storage_set_refresh_token(token: String) -> Result<(), String> {
    storage::set_refresh_token(&token)
}

#[tauri::command]
fn storage_clear_refresh_token() -> Result<(), String> {
    storage::clear_refresh_token()
}

#[tauri::command]
fn storage_get_market_data_status() -> Result<bool, String> {
    storage::get_brapi_api_key().map(|opt| opt.is_some())
}

#[tauri::command]
fn storage_set_brapi_api_key(token: String) -> Result<(), String> {
    storage::set_brapi_api_key(&token)
}

#[tauri::command]
fn storage_clear_brapi_api_key() -> Result<(), String> {
    storage::clear_brapi_api_key()
}

#[tauri::command]
async fn runtime_start(
    app: tauri::AppHandle,
    state: tauri::State<'_, Arc<LocalRuntimeManager>>,
) -> Result<RuntimeStatus, String> {
    let mgr = Arc::clone(&state);
    tauri::async_runtime::spawn_blocking(move || mgr.start(&app))
        .await
        .map_err(|e| format!("Falha na execução assíncrona do runtime: {}", e))?
}

#[tauri::command]
fn runtime_get_status(
    state: tauri::State<'_, Arc<LocalRuntimeManager>>,
) -> Result<RuntimeStatus, String> {
    state
        .status
        .lock()
        .map(|s| s.clone())
        .map_err(|e| format!("Lock error: {}", e))
}

#[tauri::command]
fn runtime_get_diagnostics(
    app: tauri::AppHandle,
    state: tauri::State<'_, Arc<LocalRuntimeManager>>,
) -> Result<serde_json::Value, String> {
    Ok(state.get_diagnostics(&app))
}

#[tauri::command]
async fn runtime_restart(
    app: tauri::AppHandle,
    state: tauri::State<'_, Arc<LocalRuntimeManager>>,
) -> Result<RuntimeStatus, String> {
    let mgr = Arc::clone(&state);
    tauri::async_runtime::spawn_blocking(move || {
        mgr.shutdown();
        mgr.start(&app)
    })
    .await
    .map_err(|e| format!("Falha na execução assíncrona de reinício: {}", e))?
}

fn atlas_local_data_dir() -> std::path::PathBuf {
    if let Ok(localappdata) = std::env::var("LOCALAPPDATA") {
        return std::path::PathBuf::from(localappdata).join("Atlas");
    }
    if let Ok(userprofile) = std::env::var("USERPROFILE") {
        return std::path::PathBuf::from(userprofile)
            .join("AppData")
            .join("Local")
            .join("Atlas");
    }
    std::path::PathBuf::from(r"C:\Users\joseo\AppData\Local\Atlas")
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct BackgroundMonitorPrefsPayload {
    #[serde(default)]
    closed_app_news_monitoring: bool,
    #[serde(default = "default_interval_minutes")]
    news_monitoring_interval_minutes: u32,
}

fn default_interval_minutes() -> u32 {
    30
}

#[tauri::command]
fn background_monitor_sync(prefs_json: String) -> Result<task_scheduler::TaskSchedulerStatus, String> {
    let parsed: BackgroundMonitorPrefsPayload = serde_json::from_str(&prefs_json)
        .map_err(|e| format!("Preferências inválidas para monitoramento fechado: {}", e))?;

    let dir = atlas_local_data_dir();
    let _ = std::fs::create_dir_all(&dir);
    let prefs_path = dir.join("news-monitor-prefs.json");
    std::fs::write(&prefs_path, prefs_json.as_bytes())
        .map_err(|e| format!("Falha ao persistir preferências do monitor fechado: {}", e))?;

    let interval = task_scheduler::normalize_interval_minutes(parsed.news_monitoring_interval_minutes);
    if parsed.closed_app_news_monitoring {
        task_scheduler::ensure_task_enabled(interval)?;
    } else {
        task_scheduler::remove_task_if_present()?;
    }

    Ok(task_scheduler::query_task_status(
        parsed.closed_app_news_monitoring,
        interval,
    ))
}

#[tauri::command]
fn background_monitor_status(
    expected_enabled: bool,
    expected_interval: u32,
) -> Result<serde_json::Value, String> {
    let interval = task_scheduler::normalize_interval_minutes(expected_interval);
    let task = task_scheduler::query_task_status(expected_enabled, interval);

    let status_path = atlas_local_data_dir().join("news-monitor-status.json");
    let last_status: serde_json::Value = std::fs::read_to_string(&status_path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or(serde_json::Value::Null);

    Ok(serde_json::json!({
        "task": task,
        "lastExecution": last_status,
        "atlasVersion": env!("CARGO_PKG_VERSION"),
    }))
}

#[tauri::command]
fn background_monitor_repair(interval_minutes: u32) -> Result<task_scheduler::TaskSchedulerStatus, String> {
    let interval = task_scheduler::normalize_interval_minutes(interval_minutes);
    task_scheduler::ensure_task_enabled(interval)?;
    Ok(task_scheduler::query_task_status(true, interval))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // 1. Single Instance check BEFORE initializing WebView2 or Tauri Builder
    let single_instance_action = match lifecycle::acquire_or_handle_secondary() {
        Ok(lifecycle::SingleInstanceAction::Primary(guard)) => (Some(guard), "PRIMARY".to_string()),
        Ok(lifecycle::SingleInstanceAction::SecondaryRestored) => {
            log::info!("[SINGLE_INSTANCE_SECONDARY] Janela existente encontrada e restaurada. Encerrando processo secundário.");
            return;
        }
        Ok(lifecycle::SingleInstanceAction::Recovered(guard)) => {
            log::warn!("[SINGLE_INSTANCE_RECOVERED] Instância primária órfã recuperada com sucesso.");
            (Some(guard), "RECOVERED".to_string())
        }
        Err(e) => {
            eprintln!("Falha na verificação de instância única: {}", e);
            log::error!("Falha na verificação de instância única: {}", e);
            return;
        }
    };

    let runtime_mgr = Arc::new(LocalRuntimeManager::new());
    runtime_mgr.set_single_instance(single_instance_action.0, single_instance_action.1);
    let shutdown_mgr = Arc::clone(&runtime_mgr);

    tauri::Builder::default()
        .manage(runtime_mgr)
        .plugin(tauri_plugin_notification::init())
        .plugin(
            tauri_plugin_log::Builder::default()
                .max_file_size(2 * 1024 * 1024)
                .rotation_strategy(tauri_plugin_log::RotationStrategy::KeepOne)
                .level(if cfg!(debug_assertions) {
                    log::LevelFilter::Debug
                } else {
                    log::LevelFilter::Info
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            storage_get_refresh_token,
            storage_set_refresh_token,
            storage_clear_refresh_token,
            storage_get_market_data_status,
            storage_set_brapi_api_key,
            storage_clear_brapi_api_key,
            runtime_start,
            runtime_get_status,
            runtime_get_diagnostics,
            runtime_restart,
            background_monitor_sync,
            background_monitor_status,
            background_monitor_repair,
        ])
        .setup(|_app| {
            log::info!("[WINDOW_CREATED] Janela principal criada com sucesso.");
            Ok(())
        })
        .on_window_event(move |window, event| {
            match event {
                tauri::WindowEvent::CloseRequested { .. } => {
                    log::info!("[WINDOW_CLOSE_REQUESTED] Fechamento da janela principal solicitado pelo usuário.");
                    shutdown_mgr.shutdown();
                    log::info!("[APP_EXIT_REQUESTED] Encerrando aplicação Tauri.");
                    window.app_handle().exit(0);
                }
                tauri::WindowEvent::Destroyed => {
                    log::info!("[WINDOW_DESTROYED] Janela principal destruída.");
                    shutdown_mgr.shutdown();
                    window.app_handle().exit(0);
                }
                _ => {}
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(move |_app_handle, event| {
            if let tauri::RunEvent::ExitRequested { .. } = event {
                log::info!("[APP_EXIT_REQUESTED] RunEvent::ExitRequested processado.");
            }
        });
}
