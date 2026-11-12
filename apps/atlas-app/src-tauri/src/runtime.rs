use std::io::{Read, Write};
use std::net::TcpStream;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::Manager;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

const PG_PORT: u16 = 5434;
const API_PORT: u16 = 3001;

#[derive(Clone, serde::Serialize, serde::Deserialize, Debug)]
pub struct RuntimeStatus {
    pub postgres: String, // "checking" | "running" | "starting" | "failed"
    pub api: String,      // "checking" | "running" | "starting" | "ready" | "failed"
    pub overall: String,  // "idle" | "starting" | "ready" | "failed"
    pub message: String,
    pub timestamp: String,
}

impl Default for RuntimeStatus {
    fn default() -> Self {
        Self {
            postgres: "idle".to_string(),
            api: "idle".to_string(),
            overall: "idle".to_string(),
            message: "Aguardando inicialização do runtime".to_string(),
            timestamp: chrono_now(),
        }
    }
}

pub use crate::lifecycle::SingleInstanceGuard;

fn clean_path(path: &Path) -> PathBuf {
    let s = path.to_string_lossy();
    if s.starts_with(r"\\?\") {
        PathBuf::from(&s[4..])
    } else {
        path.to_path_buf()
    }
}

pub struct LocalRuntimeManager {
    api_child: Mutex<Option<Child>>,
    pub status: Mutex<RuntimeStatus>,
    pub diagnostics_log: Mutex<Vec<String>>,
    pub single_instance: Mutex<Option<SingleInstanceGuard>>,
    pub single_instance_role: Mutex<String>,
}

fn redact_value(text: String, marker: &str) -> String {
    let mut out = String::new();
    let mut remainder = text.as_str();
    while let Some(start) = remainder.find(marker) {
        out.push_str(&remainder[..start]);
        out.push_str(marker);
        let value_start = start + marker.len();
        let value_slice = &remainder[value_start..];
        let end_offset = value_slice
            .find(|c: char| c.is_whitespace() || matches!(c, '"' | '\'' | ',' | '&' | '}'))
            .unwrap_or(value_slice.len());
        out.push_str("[REDACTED]");
        remainder = &value_slice[end_offset..];
    }
    out.push_str(remainder);
    out
}

fn sanitize_runtime_text(text: &str) -> String {
    let mut out = String::new();
    let mut remainder = text;
    while let Some(start) = remainder.find("postgresql://") {
        out.push_str(&remainder[..start]);
        out.push_str("postgresql://");
        let val_slice = &remainder[start + "postgresql://".len()..];
        if let Some(at) = val_slice.find('@') {
            out.push_str("[REDACTED]");
            remainder = &val_slice[at..];
        } else {
            out.push_str(val_slice);
            remainder = "";
            break;
        }
    }
    out.push_str(remainder);

    for marker in [
        "Bearer ",
        "DATABASE_URL=",
        "BRAPI_API_KEY=",
        "MARKET_DATA_API_TOKEN=",
        "password=",
        "token=",
        "api_key=",
    ] {
        out = redact_value(out, marker);
    }
    for marker in ["\"token\":\"", "\"password\":\"", "\"apiKey\":\""] {
        out = redact_value(out, marker);
    }
    out
}

fn capture_sanitized_stream<R: Read + Send + 'static>(stream: R, path: PathBuf) {
    std::thread::spawn(move || {
        let Ok(mut file) = std::fs::OpenOptions::new().create(true).append(true).open(path) else { return; };
        let mut stream = stream;
        let mut bytes = [0u8; 1024]; let mut line = Vec::new(); let mut truncated = false;
        while let Ok(read) = stream.read(&mut bytes) {
            if read == 0 { break; }
            for byte in &bytes[..read] {
                if *byte == b'\n' {
                    let safe = if truncated { "[runtime output truncated]".to_string() } else { sanitize_runtime_text(&String::from_utf8_lossy(&line)) };
                    let _ = writeln!(file, "{}", safe); line.clear(); truncated = false;
                } else if line.len() < 16 * 1024 { line.push(*byte); } else { truncated = true; }
            }
        }
        if !line.is_empty() || truncated { let _ = writeln!(file, "{}", if truncated { "[runtime output truncated]".to_string() } else { sanitize_runtime_text(&String::from_utf8_lossy(&line)) }); }
    });
}

fn chrono_now() -> String {
    // Simple ISO 8601 timestamp without external chrono dependency
    format!("{:?}", std::time::SystemTime::now())
}

impl LocalRuntimeManager {
    pub fn new() -> Self {
        Self {
            api_child: Mutex::new(None),
            status: Mutex::new(RuntimeStatus::default()),
            diagnostics_log: Mutex::new(Vec::new()),
            single_instance: Mutex::new(None),
            single_instance_role: Mutex::new("UNKNOWN".to_string()),
        }
    }

    pub fn set_single_instance(&self, guard: Option<SingleInstanceGuard>, role: String) {
        if let Ok(mut g) = self.single_instance.lock() {
            *g = guard;
        }
        if let Ok(mut r) = self.single_instance_role.lock() {
            *r = role;
        }
    }

    pub fn log(&self, msg: &str) {
        let entry = format!("[{}] {}", chrono_now(), msg);
        log::info!("{}", entry);
        if let Ok(mut logs) = self.diagnostics_log.lock() {
            if logs.len() > 100 {
                logs.remove(0);
            }
            logs.push(entry);
        }
    }

    fn update_status(&self, postgres: &str, api: &str, overall: &str, message: &str) {
        self.log(&format!(
            "Status update: pg={}, api={}, overall='{}', msg='{}'",
            postgres, api, overall, message
        ));
        if let Ok(mut st) = self.status.lock() {
            st.postgres = postgres.to_string();
            st.api = api.to_string();
            st.overall = overall.to_string();
            st.message = message.to_string();
            st.timestamp = chrono_now();
        }
    }

    pub fn check_port(port: u16) -> bool {
        crate::pg_bootstrap::check_port(port)
    }

    pub fn check_api_ready(port: u16) -> Result<bool, String> {
        let addr = format!("127.0.0.1:{}", port).parse().map_err(|e| format!("{}", e))?;
        let mut stream = TcpStream::connect_timeout(&addr, Duration::from_millis(800))
            .map_err(|e| format!("Falha de conexão com a API na porta {}: {}", port, e))?;

        stream.set_read_timeout(Some(Duration::from_millis(2000))).ok();
        stream.set_write_timeout(Some(Duration::from_millis(1000))).ok();

        let request = format!(
            "GET /ready HTTP/1.1\r\nHost: 127.0.0.1:{}\r\nConnection: close\r\n\r\n",
            port
        );
        stream
            .write_all(request.as_bytes())
            .map_err(|e| format!("Falha no envio de requisição HTTP: {}", e))?;

        let mut response = String::new();
        stream
            .read_to_string(&mut response)
            .map_err(|e| format!("Falha ao ler resposta da API: {}", e))?;

        if response.contains("HTTP/1.1 200") && response.contains("\"database\":\"connected\"") {
            Ok(true)
        } else if response.contains("HTTP/1.1 503") {
            Err("API respondeu 503 Service Unavailable (Banco de dados não está pronto)".to_string())
        } else {
            Err(format!("Resposta inesperada da API: {}", response.lines().next().unwrap_or("vazio")))
        }
    }

    fn find_postgres_binary(&self) -> Result<PathBuf, String> {
        crate::pg_bootstrap::find_postgres_binary()
    }

    fn find_pg_data_dir(&self) -> PathBuf {
        crate::pg_bootstrap::find_pg_data_dir()
    }

    fn find_runtime_files(&self, app_handle: &tauri::AppHandle) -> Result<(PathBuf, PathBuf), String> {
        let mut searched_paths = Vec::new();

        // 1. Check Tauris resource directory
        if let Ok(resource_dir) = app_handle.path().resource_dir() {
            let candidates = [
                (
                    resource_dir.join("runtime").join("node.exe"),
                    resource_dir.join("runtime").join("api").join("bundle.cjs"),
                ),
                (
                    resource_dir.join("_up_").join("runtime").join("node.exe"),
                    resource_dir.join("_up_").join("runtime").join("api").join("bundle.cjs"),
                ),
            ];
            for (node_p, bundle_p) in &candidates {
                searched_paths.push(format!("resource_dir: {:?}, {:?}", node_p, bundle_p));
                if node_p.exists() && bundle_p.exists() {
                    return Ok((node_p.clone(), bundle_p.clone()));
                }
            }
        }

        // 2. Check relative to current exe
        if let Ok(exe_path) = std::env::current_exe() {
            if let Some(exe_dir) = exe_path.parent() {
                let candidates = [
                    (
                        exe_dir.join("runtime").join("node.exe"),
                        exe_dir.join("runtime").join("api").join("bundle.cjs"),
                    ),
                    (
                        exe_dir.join("_up_").join("runtime").join("node.exe"),
                        exe_dir.join("_up_").join("runtime").join("api").join("bundle.cjs"),
                    ),
                    (
                        exe_dir.join("resources").join("runtime").join("node.exe"),
                        exe_dir.join("resources").join("runtime").join("api").join("bundle.cjs"),
                    ),
                    (
                        exe_dir.join("resources").join("_up_").join("runtime").join("node.exe"),
                        exe_dir.join("resources").join("_up_").join("runtime").join("api").join("bundle.cjs"),
                    ),
                ];
                for (node_p, bundle_p) in &candidates {
                    searched_paths.push(format!("exe_dir: {:?}, {:?}", node_p, bundle_p));
                    if node_p.exists() && bundle_p.exists() {
                        return Ok((node_p.clone(), bundle_p.clone()));
                    }
                }
            }
        }

        // 3. Check development / workspace paths
        let dev_candidates = [
            (
                PathBuf::from(r"C:\Projetos\atlas-invest\apps\atlas-app\runtime\node.exe"),
                PathBuf::from(r"C:\Projetos\atlas-invest\apps\atlas-app\runtime\api\bundle.cjs"),
            ),
            (
                PathBuf::from(r"apps\atlas-app\runtime\node.exe"),
                PathBuf::from(r"apps\atlas-app\runtime\api\bundle.cjs"),
            ),
        ];

        for (node_p, bundle_p) in &dev_candidates {
            searched_paths.push(format!("dev_candidate: {:?}, {:?}", node_p, bundle_p));
            if node_p.exists() && bundle_p.exists() {
                return Ok((node_p.clone(), bundle_p.clone()));
            }
        }

        // 4. Fallback: system node + repo bundle
        let fallback_bundle = PathBuf::from(r"C:\Projetos\atlas-invest\apps\api\dist\bundle.cjs");
        if fallback_bundle.exists() {
            let sys_node = PathBuf::from(r"C:\Program Files\nodejs\node.exe");
            if sys_node.exists() {
                return Ok((sys_node, fallback_bundle));
            }
        }

        Err(format!(
            "Arquivos de runtime da API não foram encontrados. Caminhos auditados: {}",
            searched_paths.join(" | ")
        ))
    }

    pub fn ensure_postgres(&self) -> Result<(), String> {
        self.log("Verificando status do PostgreSQL na porta 5434...");
        if Self::check_port(PG_PORT) {
            self.log("PostgreSQL já está em execução na porta 5434.");
            return Ok(());
        }

        self.update_status(
            "starting",
            "idle",
            "starting",
            "Preparando banco de dados local...",
        );

        let outcome = crate::pg_bootstrap::ensure_postgres()?;
        if outcome.started_postgres {
            self.log("PostgreSQL iniciado e pronto na porta 5434.");
        }
        Ok(())
    }

    pub fn ensure_api(&self, app_handle: &tauri::AppHandle) -> Result<(), String> {
        self.log("Verificando status da API local em http://127.0.0.1:3001/ready...");

        if let Ok(true) = Self::check_api_ready(API_PORT) {
            self.log("API local já está operacional e pronta.");
            return Ok(());
        }

        self.update_status(
            "running",
            "starting",
            "starting",
            "Iniciando serviço de dados local do Atlas...",
        );

        let (raw_node_bin, raw_bundle_cjs) = self.find_runtime_files(app_handle)?;
        let node_bin = clean_path(&raw_node_bin);
        let bundle_cjs = clean_path(&raw_bundle_cjs);
        self.log(&format!(
            "Iniciando API local: node={:?}, bundle={:?}",
            node_bin, bundle_cjs
        ));

        let working_dir = bundle_cjs
            .parent()
            .ok_or_else(|| "Diretório do bundle inválido".to_string())?;

        let mut cmd = Command::new(&node_bin);
        cmd.arg(&bundle_cjs);
        cmd.current_dir(working_dir);
        cmd.env("PORT", API_PORT.to_string());
        cmd.env(
            "DATABASE_URL",
            format!("postgresql://atlas:atlas@127.0.0.1:{}/atlas_local?schema=public", PG_PORT),
        );
        cmd.env("ATLAS_LOCAL_OWNER_MODE", "true");
        cmd.env("NODE_ENV", "production");
        cmd.env("EMAIL_PROVIDER", "CONSOLE");
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

        // Resolve BRAPI_API_KEY securely from credential store (Windows Credential Manager) or environment
        let brapi_token = crate::storage::get_brapi_api_key()
            .ok()
            .flatten()
            .or_else(|| std::env::var("BRAPI_API_KEY").ok().filter(|k| !k.trim().is_empty()));

        if let Some(token) = brapi_token {
            cmd.env("BRAPI_API_KEY", token);
        }

        // Setup api.log for capturing stdout and stderr with rotation
        let api_log_path = std::env::var("LOCALAPPDATA")
            .map(|l| PathBuf::from(l).join("Atlas").join("api.log"))
            .unwrap_or_else(|_| PathBuf::from("api.log"));

        if let Some(parent) = api_log_path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }

        if api_log_path.exists() {
            if let Ok(meta) = std::fs::metadata(&api_log_path) {
                // Rotate if log exceeds 2MB
                if meta.len() > 2 * 1024 * 1024 {
                    let old_log = api_log_path.with_extension("log.old");
                    let _ = std::fs::rename(&api_log_path, old_log);
                }
            }
        }

        if let Ok(log_file) = std::fs::OpenOptions::new()
            .create(true)
            .write(true)
            .truncate(true)
            .open(&api_log_path)
        {
            drop(log_file);
        }
        cmd.stdout(Stdio::piped());
        cmd.stderr(Stdio::piped());

        #[cfg(target_os = "windows")]
        cmd.creation_flags(CREATE_NO_WINDOW);

        let mut child = cmd
            .spawn()
            .map_err(|e| format!("Falha ao iniciar processo da API local: {}", e))?;

        if let Some(stdout) = child.stdout.take() { capture_sanitized_stream(stdout, api_log_path.clone()); }
        if let Some(stderr) = child.stderr.take() { capture_sanitized_stream(stderr, api_log_path.clone()); }

        if let Ok(mut guard) = self.api_child.lock() {
            *guard = Some(child);
        }

        // Poll /ready until connected (up to 30s) with early exit detection
        self.update_status(
            "running",
            "starting",
            "starting",
            "Verificando estrutura e conectividade do banco...",
        );

        let start = Instant::now();
        while start.elapsed() < Duration::from_secs(30) {
            std::thread::sleep(Duration::from_millis(600));

            // Early exit detection: check if child process has terminated
            if let Ok(mut guard) = self.api_child.lock() {
                if let Some(child) = guard.as_mut() {
                    match child.try_wait() {
                        Ok(Some(status)) => {
                            let recent_stderr = Self::read_recent_api_log(&api_log_path);
                            let exit_code = status.code().unwrap_or(-1);
                            let err_msg = format!(
                                "O serviço local encerrou prematuramente (código: {}).\nDiagnóstico: {}",
                                exit_code,
                                recent_stderr.trim()
                            );
                            self.log(&err_msg);
                            return Err(err_msg);
                        }
                        Ok(None) => {} // Still running
                        Err(e) => {
                            self.log(&format!("Aviso: erro ao verificar processo da API: {}", e));
                        }
                    }
                }
            }

            match Self::check_api_ready(API_PORT) {
                Ok(true) => {
                    self.log(&format!(
                        "API local pronta e conectada ao banco em {:?}",
                        start.elapsed()
                    ));
                    return Ok(());
                }
                Ok(false) => {}
                Err(err) => {
                    self.log(&format!("Polling /ready: {}", err));
                }
            }
        }

        let timeout_details = Self::read_recent_api_log(&api_log_path);
        Err(format!(
            "Tempo esgotado aguardando a API local responder /ready com status: ok (30s). Detalhes: {}",
            timeout_details.trim()
        ))
    }

    fn read_recent_api_log(path: &Path) -> String {
        if let Ok(content) = std::fs::read_to_string(path) {
            let lines: Vec<&str> = content.lines().collect();
            let start = if lines.len() > 15 { lines.len() - 15 } else { 0 };
            let tail = lines[start..].join("\n");
            sanitize_runtime_text(&tail)
        } else {
            "Sem registros de log disponíveis".to_string()
        }
    }

    pub fn start(&self, app_handle: &tauri::AppHandle) -> Result<RuntimeStatus, String> {
        self.log("=== Iniciando Local Runtime Orchestration ===");

        // 1. Acquire single instance guard if not already held
        if let Ok(mut guard) = self.single_instance.lock() {
            if guard.is_none() {
                match crate::lifecycle::acquire_or_handle_secondary() {
                    Ok(crate::lifecycle::SingleInstanceAction::Primary(g))
                    | Ok(crate::lifecycle::SingleInstanceAction::Recovered(g)) => {
                        *guard = Some(g);
                        self.log("SingleInstanceGuard adquirido com sucesso.");
                    }
                    Ok(crate::lifecycle::SingleInstanceAction::SecondaryRestored) => {
                        let msg = "Outra instância ativa do Atlas foi focalizada.".to_string();
                        self.update_status("idle", "idle", "idle", &msg);
                        return Err(msg);
                    }
                    Err(e) => {
                        self.update_status("failed", "failed", "failed", &e);
                        return Err(e);
                    }
                }
            }
        }

        // 2. Ensure PostgreSQL
        if let Err(err) = self.ensure_postgres() {
            self.update_status("failed", "idle", "failed", &err);
            return Err(err);
        }

        // 3. Ensure Local API
        if let Err(err) = self.ensure_api(app_handle) {
            self.update_status("running", "failed", "failed", &err);
            return Err(err);
        }

        // 4. All ready
        self.update_status(
            "running",
            "ready",
            "ready",
            "Atlas pronto para uso local",
        );

        let st = self.status.lock().unwrap().clone();
        Ok(st)
    }

    pub fn shutdown(&self) {
        self.log("=== Encerrando processos gerenciados do Atlas ===");
        if let Ok(mut guard) = self.api_child.lock() {
            if let Some(mut child) = guard.take() {
                self.log("Finalizando processo filho da API local...");
                let _ = child.kill();
                let _ = child.wait();
                self.log("Processo filho da API finalizado com sucesso.");
            }
        }
        // Explicitly release single instance guard so subsequent launches are not blocked
        if let Ok(mut guard) = self.single_instance.lock() {
            if let Some(g) = guard.take() {
                drop(g);
                self.log("SingleInstanceGuard liberado com sucesso.");
            }
        }
        // PostgreSQL is intentionally kept running for instant subsequent launches
        self.log("PostgreSQL mantido em execução para reinicialização rápida.");
    }

    pub fn get_diagnostics(&self, app_handle: &tauri::AppHandle) -> serde_json::Value {
        let logs = self.diagnostics_log.lock().map(|l| l.clone()).unwrap_or_default();
        let status = self.status.lock().map(|s| s.clone()).unwrap_or_default();
        let pg_port_open = Self::check_port(PG_PORT);
        let api_port_open = Self::check_port(API_PORT);
        let api_ready_check = Self::check_api_ready(API_PORT).unwrap_or(false);

        let runtime_files = self.find_runtime_files(app_handle).ok();

        let main_window = app_handle.get_webview_window("main");
        let main_window_exists = main_window.is_some();
        let main_window_visible = main_window.as_ref().and_then(|w| w.is_visible().ok()).unwrap_or(false);
        let main_window_focused = main_window.as_ref().and_then(|w| w.is_focused().ok()).unwrap_or(false);

        serde_json::json!({
            "status": status,
            "window": {
                "mainWindowExists": main_window_exists,
                "mainWindowVisible": main_window_visible,
                "mainWindowFocused": main_window_focused,
            },
            "singleInstanceRole": self.single_instance_role.lock().map(|r| r.clone()).unwrap_or_else(|_| "UNKNOWN".to_string()),
            "ports": {
                "postgres_5434": pg_port_open,
                "api_3001": api_port_open,
                "api_ready": api_ready_check,
            },
            "paths": {
                "postgres_bin": self.find_postgres_binary().map(|p| p.display().to_string()).unwrap_or_default(),
                "postgres_data": self.find_pg_data_dir().display().to_string(),
                "node_bin": runtime_files.as_ref().map(|(n, _)| n.display().to_string()).unwrap_or_default(),
                "bundle_cjs": runtime_files.as_ref().map(|(_, b)| b.display().to_string()).unwrap_or_default(),
            },
            "recent_logs": logs,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::sanitize_runtime_text;

    #[test]
    fn removes_known_synthetic_secrets_without_hiding_diagnostics() {
        let secret = "synthetic-token-Alpha_123";
        let input = format!("DATABASE_URL=postgresql://user:p%40ss@db/test Authorization: Bearer {} BRAPI_API_KEY={} connection refused", secret, secret);
        let output = sanitize_runtime_text(&input);
        assert!(!output.contains(secret));
        assert!(!output.contains("p%40ss"));
        assert!(output.contains("connection refused"));
        assert!(output.contains("[REDACTED]"));
    }

    #[test]
    fn removes_json_and_multiline_synthetic_secrets() {
        let secret = "synthetic-json-secret";
        let output = sanitize_runtime_text(&format!("{{\"token\":\"{}\"}}\nMARKET_DATA_API_TOKEN={}", secret, secret));
        assert!(!output.contains(secret));
        assert!(output.contains("[REDACTED]"));
    }
}
