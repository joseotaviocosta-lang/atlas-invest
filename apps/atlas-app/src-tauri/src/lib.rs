pub mod runtime;
pub mod storage;

use std::sync::Arc;
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let runtime_mgr = Arc::new(LocalRuntimeManager::new());
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
            runtime_start,
            runtime_get_status,
            runtime_get_diagnostics,
            runtime_restart,
        ])
        .on_window_event(move |_window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                shutdown_mgr.shutdown();
            }
        })
        .setup(|_app| Ok(()))
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(move |_app_handle, event| {
            if let tauri::RunEvent::ExitRequested { .. } = event {
                // Final safety shutdown
            }
        });
}
