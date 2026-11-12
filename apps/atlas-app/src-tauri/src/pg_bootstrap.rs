use crate::bootstrap_config::atlas_data_dir;
pub use crate::bootstrap_config::PG_PORT;
use crate::lifecycle::SingleInstanceGuard;
use std::net::TcpStream;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

const PG_BOOTSTRAP_MUTEX_NAME: &str = "Local\\AtlasInvestPostgresBootstrapMutex";
const PG_DESKTOP_LEASE_MUTEX_NAME: &str = "Local\\AtlasInvestDesktopPostgresActive";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PostgresEnsureOutcome {
    pub started_postgres: bool,
    pub started_pid: Option<u32>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PostgresStopOutcome {
    NotOwner,
    KeptForDesktopHandoff,
    Stopped,
}

#[cfg(target_os = "windows")]
mod pg_win32 {
    use super::{PG_BOOTSTRAP_MUTEX_NAME, PG_DESKTOP_LEASE_MUTEX_NAME};
    use crate::lifecycle::win32::{to_wide_null, CloseHandle, CreateMutexW};
    use crate::lifecycle::SingleInstanceGuard;
    use std::ffi::c_void;

    const SYNCHRONIZE: u32 = 0x00100000;
    const PROCESS_QUERY_LIMITED_INFORMATION: u32 = 0x1000;
    const WAIT_OBJECT_0: u32 = 0x00000000;
    const WAIT_ABANDONED: u32 = 0x00000080;
    const STILL_ACTIVE: u32 = 259;

    extern "system" {
        fn OpenMutexW(dwDesiredAccess: u32, bInheritHandle: i32, lpName: *const u16) -> *mut c_void;
        fn WaitForSingleObject(hHandle: *mut c_void, dwMilliseconds: u32) -> u32;
        fn ReleaseMutex(hMutex: *mut c_void) -> i32;
        fn OpenProcess(dwDesiredAccess: u32, bInheritHandle: i32, dwProcessId: u32) -> *mut c_void;
        fn GetExitCodeProcess(hProcess: *mut c_void, lpExitCode: *mut u32) -> i32;
    }

    pub struct PgBootstrapLock {
        handle: *mut c_void,
    }

    impl Drop for PgBootstrapLock {
        fn drop(&mut self) {
            if !self.handle.is_null() {
                unsafe {
                    ReleaseMutex(self.handle);
                    CloseHandle(self.handle);
                }
                self.handle = std::ptr::null_mut();
            }
        }
    }

    pub fn acquire_pg_bootstrap_lock(timeout_ms: u32) -> Result<PgBootstrapLock, String> {
        let wide = to_wide_null(PG_BOOTSTRAP_MUTEX_NAME);
        let handle = unsafe { CreateMutexW(std::ptr::null_mut(), 0, wide.as_ptr()) };
        if handle.is_null() {
            return Err("Falha ao criar mutex de inicialização do PostgreSQL".to_string());
        }
        let wait_res = unsafe { WaitForSingleObject(handle, timeout_ms) };
        if wait_res != WAIT_OBJECT_0 && wait_res != WAIT_ABANDONED {
            unsafe { CloseHandle(handle) };
            return Err("Timeout aguardando lock de inicialização do PostgreSQL".to_string());
        }
        Ok(PgBootstrapLock { handle })
    }

    pub fn acquire_desktop_pg_lease() -> Option<SingleInstanceGuard> {
        let wide = to_wide_null(PG_DESKTOP_LEASE_MUTEX_NAME);
        let handle = unsafe { CreateMutexW(std::ptr::null_mut(), 0, wide.as_ptr()) };
        if handle.is_null() {
            None
        } else {
            Some(SingleInstanceGuard::from_handle(handle))
        }
    }

    pub fn is_desktop_pg_lease_active() -> bool {
        let wide = to_wide_null(PG_DESKTOP_LEASE_MUTEX_NAME);
        let handle = unsafe { OpenMutexW(SYNCHRONIZE, 0, wide.as_ptr()) };
        if handle.is_null() {
            false
        } else {
            unsafe { CloseHandle(handle) };
            true
        }
    }

    pub fn is_pid_alive(pid: u32) -> bool {
        if pid == 0 {
            return false;
        }
        let handle = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid) };
        if handle.is_null() {
            return false;
        }
        let mut exit_code: u32 = 0;
        let ok = unsafe { GetExitCodeProcess(handle, &mut exit_code) };
        unsafe { CloseHandle(handle) };
        ok != 0 && exit_code == STILL_ACTIVE
    }
}

#[cfg(not(target_os = "windows"))]
mod pg_win32 {
    use crate::lifecycle::SingleInstanceGuard;
    pub struct PgBootstrapLock;
    pub fn acquire_pg_bootstrap_lock(_timeout_ms: u32) -> Result<PgBootstrapLock, String> {
        Ok(PgBootstrapLock)
    }
    pub fn acquire_desktop_pg_lease() -> Option<SingleInstanceGuard> {
        Some(SingleInstanceGuard::new())
    }
    pub fn is_desktop_pg_lease_active() -> bool {
        false
    }
    pub fn is_pid_alive(_pid: u32) -> bool {
        false
    }
}

pub fn acquire_desktop_pg_lease() -> Option<SingleInstanceGuard> {
    pg_win32::acquire_desktop_pg_lease()
}

pub fn is_desktop_pg_lease_active() -> bool {
    pg_win32::is_desktop_pg_lease_active()
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
    atlas_data_dir().join("pg_data")
}

fn read_postmaster_pid(pg_data: &Path) -> Option<u32> {
    let pid_file = pg_data.join("postmaster.pid");
    let raw = std::fs::read_to_string(pid_file).ok()?;
    raw.lines().next()?.trim().parse::<u32>().ok()
}

/// Removes a stale `postmaster.pid` ONLY when port 5434 is closed AND the recorded PID is dead.
pub fn cleanup_stale_postmaster_pid(pg_data: &Path) -> bool {
    let pid_file = pg_data.join("postmaster.pid");
    if !pid_file.exists() || check_port(PG_PORT) {
        return false;
    }
    if let Some(pid) = read_postmaster_pid(pg_data) {
        if pg_win32::is_pid_alive(pid) {
            return false;
        }
    }
    std::fs::remove_file(pid_file).is_ok()
}

/// Ensures local PostgreSQL on port 5434 is listening and ready for SQL queries.
/// Uses a cross-process Windows mutex (`Local\AtlasInvestPostgresBootstrapMutex`) so
/// Desktop and background monitor never race to spawn duplicate instances.
pub fn ensure_postgres() -> Result<PostgresEnsureOutcome, String> {
    let _lock = pg_win32::acquire_pg_bootstrap_lock(30_000)?;

    if is_postgres_ready(PG_PORT) {
        return Ok(PostgresEnsureOutcome {
            started_postgres: false,
            started_pid: None,
        });
    }

    if check_port(PG_PORT) {
        let wait_existing = Instant::now();
        while wait_existing.elapsed() < Duration::from_secs(15) {
            std::thread::sleep(Duration::from_millis(300));
            if is_postgres_ready(PG_PORT) {
                return Ok(PostgresEnsureOutcome {
                    started_postgres: false,
                    started_pid: None,
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

    let _ = cleanup_stale_postmaster_pid(&pg_data);

    let mut cmd = Command::new(&pg_bin);
    cmd.arg("-D").arg(&pg_data);
    cmd.stdin(Stdio::null());
    cmd.stdout(Stdio::null());
    cmd.stderr(Stdio::null());

    #[cfg(target_os = "windows")]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let child = cmd
        .spawn()
        .map_err(|e| format!("Falha ao iniciar postgres.exe: {}", e))?;
    let spawned_pid = child.id();

    let start = Instant::now();
    while start.elapsed() < Duration::from_secs(25) {
        std::thread::sleep(Duration::from_millis(300));
        if is_postgres_ready(PG_PORT) {
            return Ok(PostgresEnsureOutcome {
                started_postgres: true,
                started_pid: Some(spawned_pid),
            });
        }
    }

    Err("Tempo esgotado aguardando o PostgreSQL inicializar na porta 5434 (25s)".to_string())
}

/// Stops local PostgreSQL cleanly ONLY if:
/// 1. This process started PostgreSQL (`started_postgres == true`),
/// 2. Desktop does NOT hold an active PostgreSQL lease (`Local\AtlasInvestDesktopPostgresActive`),
/// 3. `postmaster.pid` in `pg_data` confirms the running instance belongs to Atlas `pg_data`.
pub fn stop_postgres_if_owned(outcome: PostgresEnsureOutcome) -> Result<PostgresStopOutcome, String> {
    if !outcome.started_postgres {
        return Ok(PostgresStopOutcome::NotOwner);
    }

    let _lock = pg_win32::acquire_pg_bootstrap_lock(15_000)?;

    if is_desktop_pg_lease_active() {
        return Ok(PostgresStopOutcome::KeptForDesktopHandoff);
    }

    let pg_data = find_pg_data_dir();
    if !pg_data.exists() {
        return Ok(PostgresStopOutcome::NotOwner);
    }

    let postmaster_pid = read_postmaster_pid(&pg_data);
    if let (Some(expected_pid), Some(actual_pid)) = (outcome.started_pid, postmaster_pid) {
        if expected_pid != actual_pid && !pg_win32::is_pid_alive(expected_pid) {
            // Another instance replaced ours; do not stop foreign Postgres
            return Ok(PostgresStopOutcome::NotOwner);
        }
    }

    let pg_ctl = find_pg_ctl_binary()?;
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

    Ok(PostgresStopOutcome::Stopped)
}

#[cfg(test)]
mod tests {
    use super::{cleanup_stale_postmaster_pid, PostgresEnsureOutcome, PostgresStopOutcome, stop_postgres_if_owned};
    use std::fs;

    #[test]
    fn stop_postgres_never_stops_when_not_owner() {
        let res = stop_postgres_if_owned(PostgresEnsureOutcome {
            started_postgres: false,
            started_pid: None,
        })
        .unwrap();
        assert_eq!(res, PostgresStopOutcome::NotOwner);
    }

    #[test]
    fn removes_stale_postmaster_pid_when_pid_is_dead() {
        let dir = std::env::temp_dir().join(format!("atlas-pg-stale-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let pid_file = dir.join("postmaster.pid");
        fs::write(&pid_file, "999999\nC:\\fake\\pg_data\n").unwrap();

        if !super::check_port(super::PG_PORT) {
            assert!(cleanup_stale_postmaster_pid(&dir));
            assert!(!pid_file.exists());
        }
        let _ = fs::remove_dir_all(&dir);
    }
}
