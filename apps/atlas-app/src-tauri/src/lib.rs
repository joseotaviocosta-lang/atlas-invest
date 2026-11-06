pub mod storage;

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
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
        ])
        .setup(|_app| Ok(()))
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
