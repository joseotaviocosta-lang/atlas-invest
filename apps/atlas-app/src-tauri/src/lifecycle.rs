#[derive(Debug)]
pub enum SingleInstanceAction {
    Primary(SingleInstanceGuard),
    SecondaryRestored,
    Recovered(SingleInstanceGuard),
}

pub struct SingleInstanceGuard {
    #[cfg(target_os = "windows")]
    handle: *mut std::ffi::c_void,
}

impl std::fmt::Debug for SingleInstanceGuard {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        #[cfg(target_os = "windows")]
        {
            write!(f, "SingleInstanceGuard({:?})", self.handle)
        }
        #[cfg(not(target_os = "windows"))]
        {
            write!(f, "SingleInstanceGuard(non-windows)")
        }
    }
}

unsafe impl Send for SingleInstanceGuard {}
unsafe impl Sync for SingleInstanceGuard {}

impl SingleInstanceGuard {
    #[cfg(target_os = "windows")]
    pub fn from_handle(handle: *mut std::ffi::c_void) -> Self {
        Self { handle }
    }

    #[cfg(not(target_os = "windows"))]
    pub fn new() -> Self {
        Self {}
    }

    #[cfg(target_os = "windows")]
    pub fn is_valid(&self) -> bool {
        !self.handle.is_null()
    }

    #[cfg(not(target_os = "windows"))]
    pub fn is_valid(&self) -> bool {
        true
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
                self.handle = std::ptr::null_mut();
            }
        }
    }
}

#[cfg(target_os = "windows")]
pub mod win32 {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;

    pub const ERROR_ALREADY_EXISTS: u32 = 183;
    pub const SW_RESTORE: i32 = 9;
    pub const PROCESS_TERMINATE: u32 = 0x0001;
    pub const TH32CS_SNAPPROCESS: u32 = 0x00000002;

    #[repr(C)]
    #[allow(non_snake_case)]
    pub struct PROCESSENTRY32W {
        pub dwSize: u32,
        pub cntUsage: u32,
        pub th32ProcessID: u32,
        pub th32DefaultHeapID: usize,
        pub th32ModuleID: u32,
        pub cntThreads: u32,
        pub th32ParentProcessID: u32,
        pub pcPriClassBase: i32,
        pub dwFlags: u32,
        pub szExeFile: [u16; 260],
    }

    extern "system" {
        pub fn CreateMutexW(
            lpMutexAttributes: *mut std::ffi::c_void,
            bInitialOwner: i32,
            lpName: *const u16,
        ) -> *mut std::ffi::c_void;
        pub fn GetLastError() -> u32;
        pub fn CloseHandle(hObject: *mut std::ffi::c_void) -> i32;
        pub fn FindWindowW(lpClassName: *const u16, lpWindowName: *const u16) -> *mut std::ffi::c_void;
        pub fn ShowWindow(hWnd: *mut std::ffi::c_void, nCmdShow: i32) -> i32;
        pub fn SetForegroundWindow(hWnd: *mut std::ffi::c_void) -> i32;
        pub fn IsIconic(hWnd: *mut std::ffi::c_void) -> i32;
        pub fn GetCurrentProcessId() -> u32;
        pub fn OpenProcess(dwDesiredAccess: u32, bInheritHandle: i32, dwProcessId: u32) -> *mut std::ffi::c_void;
        pub fn TerminateProcess(hProcess: *mut std::ffi::c_void, uExitCode: u32) -> i32;
        pub fn CreateToolhelp32Snapshot(dwFlags: u32, th32ProcessID: u32) -> *mut std::ffi::c_void;
        pub fn Process32FirstW(hSnapshot: *mut std::ffi::c_void, lppe: *mut PROCESSENTRY32W) -> i32;
        pub fn Process32NextW(hSnapshot: *mut std::ffi::c_void, lppe: *mut PROCESSENTRY32W) -> i32;
        pub fn EnumWindows(
            lpEnumFunc: unsafe extern "system" fn(*mut std::ffi::c_void, isize) -> i32,
            lParam: isize,
        ) -> i32;
        pub fn GetWindowThreadProcessId(hWnd: *mut std::ffi::c_void, lpdwProcessId: *mut u32) -> u32;
        pub fn GetWindowTextW(hWnd: *mut std::ffi::c_void, lpString: *mut u16, nMaxCount: i32) -> i32;
        pub fn IsWindowVisible(hWnd: *mut std::ffi::c_void) -> i32;
    }

    pub fn to_wide_null(s: &str) -> Vec<u16> {
        OsStr::new(s).encode_wide().chain(std::iter::once(0)).collect()
    }
}

#[cfg(target_os = "windows")]
pub fn find_atlas_window() -> Option<*mut std::ffi::c_void> {
    unsafe {
        // 1. Direct search by title "Atlas"
        let title = win32::to_wide_null("Atlas");
        let hwnd = win32::FindWindowW(std::ptr::null(), title.as_ptr());
        if !hwnd.is_null() {
            return Some(hwnd);
        }

        // 2. Enumeration fallback: find window belonging to an atlas-app.exe process
        struct EnumData {
            current_pid: u32,
            target_hwnd: *mut std::ffi::c_void,
        }

        unsafe extern "system" fn enum_proc(hwnd: *mut std::ffi::c_void, lparam: isize) -> i32 {
            let data = &mut *(lparam as *mut EnumData);
            let mut pid = 0u32;
            win32::GetWindowThreadProcessId(hwnd, &mut pid);

            // Ignore windows belonging to current process
            if pid != 0 && pid != data.current_pid {
                let mut buf = [0u16; 256];
                let len = win32::GetWindowTextW(hwnd, buf.as_mut_ptr(), 256);
                if len > 0 {
                    let title = String::from_utf16_lossy(&buf[..len as usize]);
                    if title.contains("Atlas") {
                        data.target_hwnd = hwnd;
                        return 0; // stop enumeration
                    }
                }
            }
            1 // continue
        }

        let mut data = EnumData {
            current_pid: win32::GetCurrentProcessId(),
            target_hwnd: std::ptr::null_mut(),
        };

        win32::EnumWindows(enum_proc, &mut data as *mut EnumData as isize);

        if !data.target_hwnd.is_null() {
            Some(data.target_hwnd)
        } else {
            None
        }
    }
}

#[cfg(target_os = "windows")]
pub fn restore_and_focus_window(hwnd: *mut std::ffi::c_void) {
    unsafe {
        // SW_RESTORE (9) un-minimizes if minimized and activates window
        win32::ShowWindow(hwnd, win32::SW_RESTORE);
        win32::SetForegroundWindow(hwnd);
    }
}

#[cfg(target_os = "windows")]
pub fn terminate_orphan_processes() -> usize {
    let mut terminated_count = 0;
    unsafe {
        let current_pid = win32::GetCurrentProcessId();
        let snapshot = win32::CreateToolhelp32Snapshot(win32::TH32CS_SNAPPROCESS, 0);
        if snapshot.is_null() || snapshot as isize == -1 {
            return 0;
        }

        let mut entry = win32::PROCESSENTRY32W {
            dwSize: std::mem::size_of::<win32::PROCESSENTRY32W>() as u32,
            cntUsage: 0,
            th32ProcessID: 0,
            th32DefaultHeapID: 0,
            th32ModuleID: 0,
            cntThreads: 0,
            th32ParentProcessID: 0,
            pcPriClassBase: 0,
            dwFlags: 0,
            szExeFile: [0u16; 260],
        };

        if win32::Process32FirstW(snapshot, &mut entry) != 0 {
            loop {
                let exe_len = entry.szExeFile.iter().position(|&c| c == 0).unwrap_or(260);
                let exe_name = String::from_utf16_lossy(&entry.szExeFile[..exe_len]).to_lowercase();

                if (exe_name == "atlas-app.exe" || exe_name == "atlas-app") && entry.th32ProcessID != current_pid {
                    log::warn!(
                        "[SINGLE_INSTANCE_RECOVERY] Encontrado processo órfão do Atlas (PID: {}). Finalizando...",
                        entry.th32ProcessID
                    );
                    let h_proc = win32::OpenProcess(win32::PROCESS_TERMINATE, 0, entry.th32ProcessID);
                    if !h_proc.is_null() {
                        if win32::TerminateProcess(h_proc, 1) != 0 {
                            terminated_count += 1;
                            log::info!(
                                "[SINGLE_INSTANCE_RECOVERY] Processo órfão PID {} finalizado com sucesso.",
                                entry.th32ProcessID
                            );
                        }
                        win32::CloseHandle(h_proc);
                    }
                }

                if win32::Process32NextW(snapshot, &mut entry) == 0 {
                    break;
                }
            }
        }
        win32::CloseHandle(snapshot);
    }
    terminated_count
}

pub fn acquire_or_handle_secondary() -> Result<SingleInstanceAction, String> {
    #[cfg(target_os = "windows")]
    {
        let name = win32::to_wide_null("Global\\Atlas_Desktop_SingleInstance_Mutex");

        unsafe {
            let handle = win32::CreateMutexW(std::ptr::null_mut(), 1, name.as_ptr());
            if handle.is_null() {
                return Err("Falha ao criar descritor de mutex de instância única do Atlas".to_string());
            }

            if win32::GetLastError() == win32::ERROR_ALREADY_EXISTS {
                win32::CloseHandle(handle);
                log::info!("[SINGLE_INSTANCE_SECONDARY] Outra instância detectada. Verificando janela existente...");

                // 1. Try finding and focusing existing Atlas window
                if let Some(hwnd) = find_atlas_window() {
                    log::info!(
                        "[SINGLE_INSTANCE_FOCUS_REQUEST] Janela ativa encontrada (HWND: {:?}). Restaurando e focando...",
                        hwnd
                    );
                    restore_and_focus_window(hwnd);
                    log::info!("[SINGLE_INSTANCE_SECONDARY] Foco solicitado para janela existente. Encerrando processo secundário.");
                    return Ok(SingleInstanceAction::SecondaryRestored);
                }

                // 2. No window found: orphan headless process is holding the mutex
                log::warn!("[SINGLE_INSTANCE_RECOVERY] Mutex ativo porém nenhuma janela foi encontrada. Instância anterior órfã detectada.");
                let killed = terminate_orphan_processes();
                log::info!(
                    "[SINGLE_INSTANCE_RECOVERY] {} processo(s) órfão(s) finalizado(s). Aguardando liberação do mutex...",
                    killed
                );

                std::thread::sleep(std::time::Duration::from_millis(300));

                // 3. Retry acquiring mutex
                let retry_handle = win32::CreateMutexW(std::ptr::null_mut(), 1, name.as_ptr());
                if !retry_handle.is_null() && win32::GetLastError() != win32::ERROR_ALREADY_EXISTS {
                    log::info!("[SINGLE_INSTANCE_PRIMARY] Mutex readquirido com sucesso após recuperação de processo órfão.");
                    return Ok(SingleInstanceAction::Recovered(SingleInstanceGuard::from_handle(retry_handle)));
                }

                if !retry_handle.is_null() {
                    win32::CloseHandle(retry_handle);
                }
                return Err("Não foi possível adquirir mutex de instância única após tentativa de recuperação".to_string());
            }

            log::info!("[SINGLE_INSTANCE_PRIMARY] Mutex de instância única adquirido como instância primária.");
            Ok(SingleInstanceAction::Primary(SingleInstanceGuard::from_handle(handle)))
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        Ok(SingleInstanceAction::Primary(SingleInstanceGuard::new()))
    }
}
