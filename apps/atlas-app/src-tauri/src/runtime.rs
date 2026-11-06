use std::io::{Read, Write};
use std::net::TcpStream;
use std::path::{Path, PathBuf};
use std::process::{Child, Command};
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

pub struct SingleInstanceGuard {
    #[cfg(target_os = "windows")]
    handle: *mut std::ffi::c_void,
}

unsafe impl Send for SingleInstanceGuard {}
unsafe impl Sync for SingleInstanceGuard {}

impl SingleInstanceGuard {
    #[cfg(target_os = "windows")]
    pub fn acquire() -> Result<Self, String> {
        use std::ffi::OsStr;
        use std::os::windows::ffi::OsStrExt;

        extern "system" {
            fn CreateMutexW(
                lpMutexAttributes: *mut std::ffi::c_void,
                bInitialOwner: i32,
                lpName: *const u16,
            ) -> *mut std::ffi::c_void;
            fn GetLastError() -> u32;
            fn CloseHandle(hObject: *mut std::ffi::c_void) -> i32;
        }

        const ERROR_ALREADY_EXISTS: u32 = 183;

        let name: Vec<u16> = OsStr::new("Global\\Atlas_Desktop_SingleInstance_Mutex\0")
            .encode_wide()
            .collect();

        unsafe {
            let handle = CreateMutexW(std::ptr::null_mut(), 1, name.as_ptr());
            if handle.is_null() {
                return Err("Não foi possível criar o mutex de instância única do Atlas".to_string());
            }
            if GetLastError() == ERROR_ALREADY_EXISTS {
                CloseHandle(handle);
                return Err("Outra instância do Atlas Desktop já está em execução no computador".to_string());
            }
            Ok(Self { handle })
        }
    }

    #[cfg(not(target_os = "windows"))]
    pub fn acquire() -> Result<Self, String> {
        Ok(Self {})
    }
}

impl Drop for SingleInstanceGuard {
    fn drop(&mut self) {
        #[cfg(target_os = "windows")]
        if !self.handle.is_null() {
            extern "system" {
                fn CloseHandle(hObject: *mut std::ffi::c_void) -> i32;
            }
            unsafe {
                CloseHandle(self.handle);
            }
        }
    }
}

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
        TcpStream::connect_timeout(
            &format!("127.0.0.1:{}", port).parse().unwrap(),
            Duration::from_millis(500),
        )
        .is_ok()
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
        let candidates = [
            PathBuf::from(r"C:\Program Files\PostgreSQL\18\bin\postgres.exe"),
            PathBuf::from(r"C:\Program Files\PostgreSQL\17\bin\postgres.exe"),
            PathBuf::from(r"C:\Program Files\PostgreSQL\16\bin\postgres.exe"),
        ];

        for p in &candidates {
            if p.exists() {
                return Ok(p.clone());
            }
        }

        // Try where/which
        #[cfg(target_os = "windows")]
        if let Ok(output) = Command::new("where").arg("postgres.exe").output() {
            if output.status.success() {
                if let Ok(path_str) = String::from_utf8(output.stdout) {
                    if let Some(first_line) = path_str.lines().next() {
                        let pb = PathBuf::from(first_line.trim());
                        if pb.exists() {
                            return Ok(pb);
                        }
                    }
                }
            }
        }

        Err("Executável do PostgreSQL 18 não foi encontrado em C:\\Program Files\\PostgreSQL\\18\\bin\\postgres.exe nem no PATH".to_string())
    }

    fn find_pg_data_dir(&self) -> PathBuf {
        if let Ok(localappdata) = std::env::var("LOCALAPPDATA") {
            let p = PathBuf::from(localappdata).join("Atlas").join("pg_data");
            if p.exists() {
                return p;
            }
        }

        if let Ok(userprofile) = std::env::var("USERPROFILE") {
            let p = PathBuf::from(userprofile)
                .join("AppData")
                .join("Local")
                .join("Atlas")
                .join("pg_data");
            if p.exists() {
                return p;
            }
        }

        PathBuf::from(r"C:\Users\joseo\AppData\Local\Atlas\pg_data")
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

        let pg_bin = self.find_postgres_binary()?;
        let pg_data = self.find_pg_data_dir();

        if !pg_data.exists() {
            return Err(format!(
                "Diretório de dados do PostgreSQL não encontrado em {:?}",
                pg_data
            ));
        }

        self.log(&format!(
            "Iniciando PostgreSQL: bin={:?}, data={:?}",
            pg_bin, pg_data
        ));

        let mut cmd = Command::new(&pg_bin);
        cmd.arg("-D").arg(&pg_data);

        #[cfg(target_os = "windows")]
        cmd.creation_flags(CREATE_NO_WINDOW);

        let _child = cmd
            .spawn()
            .map_err(|e| format!("Falha ao iniciar postgres.exe: {}", e))?;

        // Poll for postgres port opening (up to 15s)
        let start = Instant::now();
        while start.elapsed() < Duration::from_secs(15) {
            std::thread::sleep(Duration::from_millis(500));
            if Self::check_port(PG_PORT) {
                self.log(&format!(
                    "PostgreSQL pronto na porta 5434 em {:?}",
                    start.elapsed()
                ));
                return Ok(());
            }
        }

        Err("Tempo esgotado aguardando o PostgreSQL inicializar na porta 5434 (15s)".to_string())
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

        // Resolve BRAPI_API_KEY securely from credential store, secrets.json, or environment
        let brapi_token = crate::storage::get_brapi_api_key().ok().flatten().or_else(|| {
            if let Ok(localappdata) = std::env::var("LOCALAPPDATA") {
                let secrets_file = PathBuf::from(localappdata).join("Atlas").join("secrets.json");
                if secrets_file.exists() {
                    if let Ok(content) = std::fs::read_to_string(secrets_file) {
                        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                            if let Some(key) = json.get("BRAPI_API_KEY").and_then(|v| v.as_str()) {
                                if !key.trim().is_empty() {
                                    return Some(key.trim().to_string());
                                }
                            }
                        }
                    }
                }
            }
            std::env::var("BRAPI_API_KEY").ok().filter(|k| !k.trim().is_empty())
        });

        if let Some(token) = brapi_token {
            cmd.env("BRAPI_API_KEY", token);
        }

        #[cfg(target_os = "windows")]
        cmd.creation_flags(CREATE_NO_WINDOW);

        let child = cmd
            .spawn()
            .map_err(|e| format!("Falha ao iniciar processo da API local: {}", e))?;

        if let Ok(mut guard) = self.api_child.lock() {
            *guard = Some(child);
        }

        // Poll /ready until connected (up to 30s)
        self.update_status(
            "running",
            "starting",
            "starting",
            "Verificando estrutura e conectividade do banco...",
        );

        let start = Instant::now();
        while start.elapsed() < Duration::from_secs(30) {
            std::thread::sleep(Duration::from_millis(600));
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

        Err("Tempo esgotado aguardando a API local responder /ready com status: ok (30s)".to_string())
    }

    pub fn start(&self, app_handle: &tauri::AppHandle) -> Result<RuntimeStatus, String> {
        self.log("=== Iniciando Local Runtime Orchestration ===");

        // 1. Acquire single instance guard if not already held
        if let Ok(mut guard) = self.single_instance.lock() {
            if guard.is_none() {
                match SingleInstanceGuard::acquire() {
                    Ok(g) => {
                        *guard = Some(g);
                        self.log("SingleInstanceGuard adquirido com sucesso.");
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

        serde_json::json!({
            "status": status,
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
