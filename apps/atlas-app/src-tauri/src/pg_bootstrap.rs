use std::net::TcpStream;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

pub const PG_PORT: u16 = 5434;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PostgresEnsureOutcome {
    pub started_postgres: bool,
}

pub fn check_port(port: u16) -> bool {
    TcpStream::connect_timeout(
        &format!("127.0.0.1:{}", port).parse().unwrap(),
        Duration::from_millis(500),
    )
    .is_ok()
}

pub fn find_postgres_binary() -> Result<PathBuf, String> {
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

    Err("Executável do PostgreSQL não foi encontrado em C:\\Program Files\\PostgreSQL\\18\\bin\\postgres.exe nem no PATH".to_string())
}

pub fn find_pg_ctl_binary() -> Result<PathBuf, String> {
    let postgres_bin = find_postgres_binary()?;
    let parent = postgres_bin
        .parent()
        .ok_or_else(|| "Diretório bin do PostgreSQL inválido".to_string())?;
    let pg_ctl = parent.join("pg_ctl.exe");
    if pg_ctl.exists() {
        return Ok(pg_ctl);
    }
    Err(format!("Executável pg_ctl.exe não encontrado em {:?}", pg_ctl))
}

fn find_pg_isready_binary() -> Option<PathBuf> {
    let postgres_bin = find_postgres_binary().ok()?;
    let pg_isready = postgres_bin.parent()?.join("pg_isready.exe");
    if pg_isready.exists() {
        Some(pg_isready)
    } else {
        None
    }
}

pub fn is_postgres_ready(port: u16) -> bool {
    if !check_port(port) {
        return false;
    }

    if let Some(pg_isready) = find_pg_isready_binary() {
        let mut cmd = Command::new(pg_isready);
        cmd.arg("-h")
            .arg("127.0.0.1")
            .arg("-p")
            .arg(port.to_string())
            .arg("-t")
            .arg("1");
        cmd.stdin(Stdio::null());
        cmd.stdout(Stdio::null());
        cmd.stderr(Stdio::null());

        #[cfg(target_os = "windows")]
        cmd.creation_flags(CREATE_NO_WINDOW);

        return cmd.status().map(|s| s.success()).unwrap_or(false);
    }

    true
}

pub fn find_pg_data_dir() -> PathBuf {
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

/// Ensures local PostgreSQL on port 5434 is listening.
/// Reuses an existing instance (`started_postgres = false`) or starts it (`started_postgres = true`).
pub fn ensure_postgres() -> Result<PostgresEnsureOutcome, String> {
    if is_postgres_ready(PG_PORT) {
        return Ok(PostgresEnsureOutcome {
            started_postgres: false,
        });
    }

    if check_port(PG_PORT) {
        let wait_existing = Instant::now();
        while wait_existing.elapsed() < Duration::from_secs(15) {
            std::thread::sleep(Duration::from_millis(300));
            if is_postgres_ready(PG_PORT) {
                return Ok(PostgresEnsureOutcome {
                    started_postgres: false,
                });
            }
        }
        return Err("PostgreSQL na porta 5434 não ficou pronto para consultas a tempo".to_string());
    }

    let pg_bin = find_postgres_binary()?;
    let pg_data = find_pg_data_dir();

    if !pg_data.exists() {
        return Err(format!(
            "Diretório de dados do PostgreSQL não encontrado em {:?}",
            pg_data
        ));
    }

    let mut cmd = Command::new(&pg_bin);
    cmd.arg("-D").arg(&pg_data);
    cmd.stdin(Stdio::null());
    cmd.stdout(Stdio::null());
    cmd.stderr(Stdio::null());

    #[cfg(target_os = "windows")]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let _child = cmd
        .spawn()
        .map_err(|e| format!("Falha ao iniciar postgres.exe: {}", e))?;

    let start = Instant::now();
    while start.elapsed() < Duration::from_secs(25) {
        std::thread::sleep(Duration::from_millis(300));
        if is_postgres_ready(PG_PORT) {
            return Ok(PostgresEnsureOutcome {
                started_postgres: true,
            });
        }
    }

    Err("Tempo esgotado aguardando o PostgreSQL inicializar na porta 5434 (25s)".to_string())
}

/// Stops local PostgreSQL cleanly ONLY if this process was the owner that started it.
pub fn stop_postgres_if_owned(started_postgres: bool) -> Result<(), String> {
    if !started_postgres {
        return Ok(());
    }

    let pg_ctl = find_pg_ctl_binary()?;
    let pg_data = find_pg_data_dir();
    if !pg_data.exists() {
        return Ok(());
    }

    let mut cmd = Command::new(&pg_ctl);
    cmd.arg("-D")
        .arg(&pg_data)
        .arg("stop")
        .arg("-m")
        .arg("fast")
        .arg("-t")
        .arg("15");
    cmd.stdin(Stdio::null());
    cmd.stdout(Stdio::null());
    cmd.stderr(Stdio::null());

    #[cfg(target_os = "windows")]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let status = cmd
        .status()
        .map_err(|e| format!("Falha ao encerrar PostgreSQL via pg_ctl: {}", e))?;

    if !status.success() {
        return Err(format!(
            "pg_ctl stop retornou código de saída {:?}",
            status.code()
        ));
    }

    Ok(())
}
