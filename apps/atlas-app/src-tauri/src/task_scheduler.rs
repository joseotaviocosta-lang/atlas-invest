use crate::bootstrap_config::atlas_data_dir;
use crate::runtime_manifest::{find_installed_runtime_manifest, validate_runtime_manifest_file};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

pub const NEWS_MONITOR_TASK_NAME: &str = "Atlas Invest - News Monitor";
const MONITOR_VERSION: &str = env!("CARGO_PKG_VERSION");
const ATLAS_BUILD_ID: &str = env!("ATLAS_BUILD_ID");

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskSchedulerStatus {
    pub installed: bool,
    pub enabled: bool,
    pub task_name: String,
    pub interval_minutes: Option<u32>,
    pub last_run_at: Option<String>,
    pub next_run_at: Option<String>,
    pub last_task_result: Option<i64>,
    pub needs_repair: bool,
    pub command_path: Option<String>,
    pub expected_command_path: Option<String>,
    pub runtime_healthy: bool,
    pub runtime_issue: Option<String>,
    pub repair_reasons: Vec<String>,
}

pub fn normalize_interval_minutes(raw: u32) -> u32 {
    match raw {
        15 | 30 | 60 => raw,
        _ => 30,
    }
}

fn escape_xml(input: &str) -> String {
    input
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

fn normalize_windows_path(raw: &str) -> String {
    let trimmed = raw.trim().trim_matches('"');
    let stripped = trimmed.strip_prefix(r"\\?\").unwrap_or(trimmed);
    stripped.replace('/', "\\").to_ascii_lowercase()
}

/// Builds a user-scoped, least-privilege, non-waking, single-instance Windows Task Scheduler XML.
pub fn build_task_xml(interval_minutes: u32, monitor_exe: &Path, start_boundary_local: &str) -> String {
    let interval = normalize_interval_minutes(interval_minutes);
    let command_escaped = escape_xml(&monitor_exe.to_string_lossy());
    let workdir_escaped = monitor_exe
        .parent()
        .map(|p| escape_xml(&p.to_string_lossy()))
        .unwrap_or_default();

    format!(
        r#"<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.4" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>Monitoramento local periódico de notícias relevantes do Project Atlas com o aplicativo fechado.</Description>
  </RegistrationInfo>
  <Triggers>
    <TimeTrigger>
      <Repetition>
        <Interval>PT{interval}M</Interval>
        <StopAtDurationEnd>false</StopAtDurationEnd>
      </Repetition>
      <StartBoundary>{start_boundary}</StartBoundary>
      <Enabled>true</Enabled>
    </TimeTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>LeastPrivilege</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>true</AllowHardTerminate>
    <StartWhenAvailable>true</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>
    <IdleSettings>
      <StopOnIdleEnd>false</StopOnIdleEnd>
      <RestartOnIdle>false</RestartOnIdle>
    </IdleSettings>
    <AllowStartOnDemand>true</AllowStartOnDemand>
    <Enabled>true</Enabled>
    <Hidden>true</Hidden>
    <RunOnlyIfIdle>false</RunOnlyIfIdle>
    <WakeToRun>false</WakeToRun>
    <ExecutionTimeLimit>PT5M</ExecutionTimeLimit>
    <Priority>7</Priority>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>{command}</Command>
      <WorkingDirectory>{workdir}</WorkingDirectory>
    </Exec>
  </Actions>
</Task>
"#,
        interval = interval,
        start_boundary = escape_xml(start_boundary_local),
        command = command_escaped,
        workdir = workdir_escaped,
    )
}

/// Resolves the canonical stable path for `atlas-news-monitor.exe`.
/// Prefers `%LOCALAPPDATA%\Atlas\_up_\runtime\atlas-news-monitor.exe` which is packaged
/// atomically alongside `runtime-manifest.json`, `node.exe`, and `api/news-monitor.cjs`.
pub fn resolve_monitor_executable() -> Result<PathBuf, String> {
    let mut searched = Vec::new();

    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            let candidates = [
                exe_dir.join("_up_").join("runtime").join("atlas-news-monitor.exe"),
                exe_dir.join("runtime").join("atlas-news-monitor.exe"),
                exe_dir.join("resources").join("_up_").join("runtime").join("atlas-news-monitor.exe"),
                exe_dir.join("resources").join("runtime").join("atlas-news-monitor.exe"),
                exe_dir.join("atlas-news-monitor.exe"),
            ];
            for p in candidates {
                searched.push(p.display().to_string());
                if p.exists() {
                    return Ok(p);
                }
            }
        }
    }

    let up_installed = atlas_data_dir()
        .join("_up_")
        .join("runtime")
        .join("atlas-news-monitor.exe");
    searched.push(up_installed.display().to_string());
    if up_installed.exists() {
        return Ok(up_installed);
    }

    let canonical_installed = atlas_data_dir().join("atlas-news-monitor.exe");
    searched.push(canonical_installed.display().to_string());
    if canonical_installed.exists() {
        return Ok(canonical_installed);
    }

    let dev_candidate = PathBuf::from(r"C:\Projetos\atlas-invest\apps\atlas-app\runtime\atlas-news-monitor.exe");
    searched.push(dev_candidate.display().to_string());
    if dev_candidate.exists() {
        return Ok(dev_candidate);
    }

    Err(format!(
        "Executável atlas-news-monitor.exe não encontrado. Caminhos verificados: {}",
        searched.join(" | ")
    ))
}

fn check_installed_runtime_health() -> (bool, Option<String>) {
    let data_dir = atlas_data_dir();
    let Some(manifest_path) = find_installed_runtime_manifest(&data_dir) else {
        return (
            false,
            Some("Manifesto de versão do runtime ausente (runtime-manifest.json).".to_string()),
        );
    };

    let Ok(monitor_exe) = resolve_monitor_executable() else {
        return (
            false,
            Some("Executável atlas-news-monitor.exe ausente.".to_string()),
        );
    };

    let Some(runtime_dir) = manifest_path.parent() else {
        return (false, Some("Diretório do manifesto de runtime inválido.".to_string()));
    };
    let node_exe = runtime_dir.join("node.exe");
    let bundle_path = runtime_dir.join("api").join("news-monitor.cjs");

    if !node_exe.exists() || !bundle_path.exists() {
        return (
            false,
            Some("Arquivos de runtime (node.exe ou news-monitor.cjs) ausentes.".to_string()),
        );
    }

    match validate_runtime_manifest_file(
        &manifest_path,
        &monitor_exe,
        &bundle_path,
        &node_exe,
        MONITOR_VERSION,
        Some(ATLAS_BUILD_ID),
    ) {
        Ok(_) => (true, None),
        Err(err) => (false, Some(err.to_string())),
    }
}

fn current_local_start_boundary() -> Result<String, String> {
    let mut cmd = Command::new("powershell");
    cmd.args([
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "(Get-Date).AddMinutes(1).ToString('yyyy-MM-ddTHH:mm:ss')",
    ]);
    cmd.stdin(Stdio::null());
    #[cfg(target_os = "windows")]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let out = cmd
        .output()
        .map_err(|e| format!("Falha ao calcular horário inicial da tarefa: {}", e))?;
    if !out.status.success() {
        return Err("Falha ao obter timestamp local para StartBoundary".to_string());
    }
    Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
}

fn encode_utf16le_bom(text: &str) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(2 + text.len() * 2);
    bytes.push(0xFF);
    bytes.push(0xFE);
    for unit in text.encode_utf16() {
        bytes.extend_from_slice(&unit.to_le_bytes());
    }
    bytes
}

pub fn ensure_task_enabled(interval_minutes: u32) -> Result<(), String> {
    let monitor_exe = resolve_monitor_executable()?;
    let start_boundary = current_local_start_boundary()?;
    let xml = build_task_xml(interval_minutes, &monitor_exe, &start_boundary);

    let temp_xml = std::env::temp_dir().join(format!("atlas-news-monitor-task-{}.xml", std::process::id()));
    std::fs::write(&temp_xml, encode_utf16le_bom(&xml))
        .map_err(|e| format!("Falha ao gravar XML temporário da tarefa: {}", e))?;

    let mut cmd = Command::new("schtasks.exe");
    cmd.args(["/Create", "/TN", NEWS_MONITOR_TASK_NAME, "/XML"])
        .arg(&temp_xml)
        .arg("/F");
    cmd.stdin(Stdio::null());
    #[cfg(target_os = "windows")]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let output = cmd.output();
    let _ = std::fs::remove_file(&temp_xml);

    let output = output.map_err(|e| format!("Falha ao executar schtasks /Create: {}", e))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        return Err(format!(
            "schtasks /Create falhou ({:?}): {} {}",
            output.status.code(),
            stderr.trim(),
            stdout.trim()
        ));
    }

    Ok(())
}

pub fn remove_task_if_present() -> Result<(), String> {
    let mut cmd = Command::new("schtasks.exe");
    cmd.args(["/Delete", "/TN", NEWS_MONITOR_TASK_NAME, "/F"]);
    cmd.stdin(Stdio::null());
    #[cfg(target_os = "windows")]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let output = cmd
        .output()
        .map_err(|e| format!("Falha ao executar schtasks /Delete: {}", e))?;

    if output.status.success() {
        return Ok(());
    }

    let mut query_cmd = Command::new("schtasks.exe");
    query_cmd.args(["/Query", "/TN", NEWS_MONITOR_TASK_NAME]);
    query_cmd.stdin(Stdio::null());
    #[cfg(target_os = "windows")]
    query_cmd.creation_flags(CREATE_NO_WINDOW);

    if let Ok(q) = query_cmd.output() {
        if !q.status.success() {
            return Ok(());
        }
    }

    let stderr = String::from_utf8_lossy(&output.stderr);
    Err(format!(
        "schtasks /Delete falhou ({:?}): {}",
        output.status.code(),
        stderr.trim()
    ))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RawTaskQuery {
    pub installed: bool,
    pub enabled: bool,
    pub interval_minutes: Option<u32>,
    pub last_run_at: Option<String>,
    pub next_run_at: Option<String>,
    pub last_task_result: Option<i64>,
    pub command_path: Option<String>,
    pub user_id: Option<String>,
    pub current_user_sid: Option<String>,
    pub wake_to_run: Option<bool>,
    pub multiple_instances: Option<String>,
    pub execution_time_limit: Option<String>,
    pub run_level: Option<String>,
    pub logon_type: Option<String>,
}

pub fn evaluate_task_repair_reasons(
    raw: &RawTaskQuery,
    expected_enabled: bool,
    expected_interval: u32,
    expected_command_path: Option<&str>,
    runtime_healthy: bool,
    runtime_issue: Option<&str>,
) -> Vec<String> {
    let mut reasons = Vec::new();
    if !expected_enabled {
        return reasons;
    }

    if !raw.installed {
        reasons.push("TASK_NOT_INSTALLED".to_string());
        return reasons;
    }

    if !raw.enabled {
        reasons.push("TASK_DISABLED".to_string());
    }

    let expected_norm = normalize_interval_minutes(expected_interval);
    if raw.interval_minutes != Some(expected_norm) {
        reasons.push("TASK_INTERVAL_DRIFT".to_string());
    }

    if let Some(expected_cmd) = expected_command_path {
        let actual_norm = raw
            .command_path
            .as_deref()
            .map(normalize_windows_path)
            .unwrap_or_default();
        let expected_cmd_norm = normalize_windows_path(expected_cmd);
        if actual_norm.is_empty() || actual_norm != expected_cmd_norm {
            reasons.push("TASK_PATH_DRIFT".to_string());
        }
    }

    if let (Some(task_uid), Some(curr_sid)) = (&raw.user_id, &raw.current_user_sid) {
        if !task_uid.trim().eq_ignore_ascii_case(curr_sid.trim()) {
            reasons.push("FOREIGN_TASK_USER".to_string());
        }
    }

    let security_ok = raw.wake_to_run == Some(false)
        && raw.multiple_instances.as_deref() == Some("IgnoreNew")
        && raw.execution_time_limit.as_deref() == Some("PT5M")
        && raw.run_level.as_deref() == Some("LeastPrivilege")
        && raw.logon_type.as_deref() == Some("InteractiveToken");
    if !security_ok {
        reasons.push("TASK_SECURITY_DRIFT".to_string());
    }

    if !runtime_healthy {
        reasons.push(
            runtime_issue
                .map(|_| "RUNTIME_VERSION_MISMATCH".to_string())
                .unwrap_or_else(|| "RUNTIME_INTEGRITY_ERROR".to_string()),
        );
    }

    reasons
}

pub fn query_task_status(expected_enabled: bool, expected_interval: u32) -> TaskSchedulerStatus {
    let expected_command_path = resolve_monitor_executable()
        .ok()
        .map(|p| p.to_string_lossy().to_string());
    let (runtime_healthy, runtime_issue) = check_installed_runtime_health();

    let ps_script = format!(
        r#"
$currSid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$t = Get-ScheduledTask -TaskName '{}' -ErrorAction SilentlyContinue
if (-not $t) {{
  @{{ installed = $false; enabled = $false; intervalMinutes = $null; lastRunAt = $null; nextRunAt = $null; lastTaskResult = $null; commandPath = $null; userId = $null; currentUserSid = $currSid; wakeToRun = $null; multipleInstances = $null; executionTimeLimit = $null; runLevel = $null; logonType = $null }} | ConvertTo-Json -Compress
  exit 0
}}
$info = Get-ScheduledTaskInfo -TaskName '{}' -ErrorAction SilentlyContinue
$intervalMin = $null
if ($t.Triggers -and $t.Triggers[0].Repetition -and $t.Triggers[0].Repetition.Interval) {{
  try {{ $intervalMin = [int]([System.Xml.XmlConvert]::ToTimeSpan($t.Triggers[0].Repetition.Interval).TotalMinutes) }} catch {{}}
}}
$lastRun = if ($info -and $info.LastRunTime -and $info.LastRunTime.Year -gt 2000) {{ $info.LastRunTime.ToUniversalTime().ToString('o') }} else {{ $null }}
$nextRun = if ($info -and $info.NextRunTime -and $info.NextRunTime.Year -gt 2000) {{ $info.NextRunTime.ToUniversalTime().ToString('o') }} else {{ $null }}
$lastRes = if ($info) {{ [int64]$info.LastTaskResult }} else {{ $null }}
$cmdPath = if ($t.Actions -and $t.Actions[0].Execute) {{ [string]$t.Actions[0].Execute }} else {{ $null }}
@{{
  installed = $true
  enabled = ($t.Settings.Enabled -and $t.State.ToString() -ne 'Disabled')
  intervalMinutes = $intervalMin
  lastRunAt = $lastRun
  nextRunAt = $nextRun
  lastTaskResult = $lastRes
  commandPath = $cmdPath
  userId = [string]$t.Principal.UserId
  currentUserSid = $currSid
  wakeToRun = [bool]$t.Settings.WakeToRun
  multipleInstances = [string]$t.Settings.MultipleInstances
  executionTimeLimit = [string]$t.Settings.ExecutionTimeLimit
  runLevel = [string]$t.Principal.RunLevel
  logonType = [string]$t.Principal.LogonType
}} | ConvertTo-Json -Compress
"#,
        NEWS_MONITOR_TASK_NAME, NEWS_MONITOR_TASK_NAME
    );

    let mut cmd = Command::new("powershell");
    cmd.args(["-NoProfile", "-NonInteractive", "-Command", &ps_script]);
    cmd.stdin(Stdio::null());
    #[cfg(target_os = "windows")]
    cmd.creation_flags(CREATE_NO_WINDOW);

    if let Ok(output) = cmd.output() {
        if output.status.success() {
            let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if let Ok(raw) = serde_json::from_str::<RawTaskQuery>(&text) {
                let repair_reasons = evaluate_task_repair_reasons(
                    &raw,
                    expected_enabled,
                    expected_interval,
                    expected_command_path.as_deref(),
                    runtime_healthy,
                    runtime_issue.as_deref(),
                );
                let needs_repair = !repair_reasons.is_empty();
                return TaskSchedulerStatus {
                    installed: raw.installed,
                    enabled: raw.enabled,
                    task_name: NEWS_MONITOR_TASK_NAME.to_string(),
                    interval_minutes: raw.interval_minutes,
                    last_run_at: raw.last_run_at,
                    next_run_at: raw.next_run_at,
                    last_task_result: raw.last_task_result,
                    needs_repair,
                    command_path: raw.command_path,
                    expected_command_path,
                    runtime_healthy,
                    runtime_issue,
                    repair_reasons,
                };
            }
        }
    }

    let mut repair_reasons = Vec::new();
    if expected_enabled {
        repair_reasons.push("TASK_QUERY_FAILED".to_string());
    }
    if !runtime_healthy {
        repair_reasons.push("RUNTIME_VERSION_MISMATCH".to_string());
    }

    TaskSchedulerStatus {
        installed: false,
        enabled: false,
        task_name: NEWS_MONITOR_TASK_NAME.to_string(),
        interval_minutes: None,
        last_run_at: None,
        next_run_at: None,
        last_task_result: None,
        needs_repair: expected_enabled,
        command_path: None,
        expected_command_path,
        runtime_healthy,
        runtime_issue,
        repair_reasons,
    }
}

/// Safe auto-repair on upgrade (PARTE S):
/// Only repairs automatically when opt-in is already ON, runtime is healthy, task belongs to
/// current user without security drift, and the only drift is `TASK_PATH_DRIFT` (upgrade A -> B).
pub fn reconcile_task_after_upgrade_if_safe(
    expected_enabled: bool,
    expected_interval: u32,
) -> TaskSchedulerStatus {
    let status = query_task_status(expected_enabled, expected_interval);
    if expected_enabled
        && status.installed
        && status.runtime_healthy
        && status.repair_reasons == vec!["TASK_PATH_DRIFT".to_string()]
    {
        if ensure_task_enabled(expected_interval).is_ok() {
            return query_task_status(expected_enabled, expected_interval);
        }
    }
    status
}

#[cfg(test)]
mod tests {
    use super::{build_task_xml, evaluate_task_repair_reasons, normalize_interval_minutes, RawTaskQuery};
    use std::path::Path;

    fn healthy_raw_task() -> RawTaskQuery {
        RawTaskQuery {
            installed: true,
            enabled: true,
            interval_minutes: Some(15),
            last_run_at: None,
            next_run_at: None,
            last_task_result: Some(0),
            command_path: Some(r"C:\Users\joseo\AppData\Local\Atlas\atlas-news-monitor.exe".to_string()),
            user_id: Some("S-1-5-21-1001".to_string()),
            current_user_sid: Some("S-1-5-21-1001".to_string()),
            wake_to_run: Some(false),
            multiple_instances: Some("IgnoreNew".to_string()),
            execution_time_limit: Some("PT5M".to_string()),
            run_level: Some("LeastPrivilege".to_string()),
            logon_type: Some("InteractiveToken".to_string()),
        }
    }

    #[test]
    fn builds_secure_user_scoped_task_xml_without_any_secrets() {
        let xml = build_task_xml(
            15,
            Path::new(r"C:\Users\joseo\AppData\Local\Atlas\atlas-news-monitor.exe"),
            "2026-11-12T08:35:00",
        );
        assert!(xml.contains("<Interval>PT15M</Interval>"));
        assert!(xml.contains("<LogonType>InteractiveToken</LogonType>"));
        assert!(xml.contains("<RunLevel>LeastPrivilege</RunLevel>"));
        assert!(xml.contains("<MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>"));
        assert!(xml.contains("<WakeToRun>false</WakeToRun>"));
        assert!(xml.contains("<ExecutionTimeLimit>PT5M</ExecutionTimeLimit>"));
        assert!(xml.contains("<Hidden>true</Hidden>"));

        let lower = xml.to_ascii_lowercase();
        assert!(!lower.contains("password"));
        assert!(!lower.contains("database_url"));
        assert!(!lower.contains("postgresql://"));
        assert!(!lower.contains("bearer"));
        assert!(!lower.contains("brapi"));
        // Only InteractiveToken XML tag may contain "token"
        let without_interactive_tag = lower.replace("<logontype>interactivetoken</logontype>", "");
        assert!(!without_interactive_tag.contains("token"));
    }

    #[test]
    fn normalizes_disallowed_intervals_to_30() {
        assert_eq!(normalize_interval_minutes(15), 15);
        assert_eq!(normalize_interval_minutes(30), 30);
        assert_eq!(normalize_interval_minutes(60), 60);
        assert_eq!(normalize_interval_minutes(5), 30);
    }

    #[test]
    fn detects_path_interval_security_and_foreign_user_drift() {
        let expected = r"C:\Users\joseo\AppData\Local\Atlas\atlas-news-monitor.exe";
        let healthy = healthy_raw_task();
        assert!(evaluate_task_repair_reasons(&healthy, true, 15, Some(expected), true, None).is_empty());

        let mut path_drift = healthy_raw_task();
        path_drift.command_path = Some(r"C:\OldAtlas\atlas-news-monitor.exe".to_string());
        assert_eq!(
            evaluate_task_repair_reasons(&path_drift, true, 15, Some(expected), true, None),
            vec!["TASK_PATH_DRIFT"]
        );

        let mut interval_drift = healthy_raw_task();
        interval_drift.interval_minutes = Some(30);
        assert_eq!(
            evaluate_task_repair_reasons(&interval_drift, true, 15, Some(expected), true, None),
            vec!["TASK_INTERVAL_DRIFT"]
        );

        let mut security_drift = healthy_raw_task();
        security_drift.wake_to_run = Some(true);
        assert_eq!(
            evaluate_task_repair_reasons(&security_drift, true, 15, Some(expected), true, None),
            vec!["TASK_SECURITY_DRIFT"]
        );

        let mut foreign_user = healthy_raw_task();
        foreign_user.user_id = Some("S-1-5-21-9999".to_string());
        assert_eq!(
            evaluate_task_repair_reasons(&foreign_user, true, 15, Some(expected), true, None),
            vec!["FOREIGN_TASK_USER"]
        );
    }
}
