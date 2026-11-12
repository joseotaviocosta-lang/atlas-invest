use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

pub const NEWS_MONITOR_TASK_NAME: &str = "Atlas Invest - News Monitor";

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

pub fn resolve_monitor_executable() -> Result<PathBuf, String> {
    let mut searched = Vec::new();

    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            let candidates = [
                exe_dir.join("atlas-news-monitor.exe"),
                exe_dir.join("_up_").join("runtime").join("atlas-news-monitor.exe"),
                exe_dir.join("runtime").join("atlas-news-monitor.exe"),
                exe_dir.join("resources").join("runtime").join("atlas-news-monitor.exe"),
                exe_dir.join("resources").join("_up_").join("runtime").join("atlas-news-monitor.exe"),
            ];
            for p in candidates {
                searched.push(p.display().to_string());
                if p.exists() {
                    return Ok(p);
                }
            }
        }
    }

    if let Ok(localappdata) = std::env::var("LOCALAPPDATA") {
        let installed = PathBuf::from(localappdata)
            .join("Atlas")
            .join("_up_")
            .join("runtime")
            .join("atlas-news-monitor.exe");
        searched.push(installed.display().to_string());
        if installed.exists() {
            return Ok(installed);
        }
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

    let temp_xml = std::env::temp_dir().join("atlas-news-monitor-task.xml");
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

    // If task does not exist, treat as idempotent success
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

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawTaskQuery {
    installed: bool,
    enabled: bool,
    interval_minutes: Option<u32>,
    last_run_at: Option<String>,
    next_run_at: Option<String>,
    last_task_result: Option<i64>,
}

pub fn query_task_status(expected_enabled: bool, expected_interval: u32) -> TaskSchedulerStatus {
    let ps_script = format!(
        r#"
$t = Get-ScheduledTask -TaskName '{}' -ErrorAction SilentlyContinue
if (-not $t) {{
  @{{ installed = $false; enabled = $false; intervalMinutes = $null; lastRunAt = $null; nextRunAt = $null; lastTaskResult = $null }} | ConvertTo-Json -Compress
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
@{{
  installed = $true
  enabled = ($t.Settings.Enabled -and $t.State.ToString() -ne 'Disabled')
  intervalMinutes = $intervalMin
  lastRunAt = $lastRun
  nextRunAt = $nextRun
  lastTaskResult = $lastRes
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
                let expected_norm = normalize_interval_minutes(expected_interval);
                let needs_repair = expected_enabled
                    && (!raw.installed || !raw.enabled || raw.interval_minutes != Some(expected_norm));
                return TaskSchedulerStatus {
                    installed: raw.installed,
                    enabled: raw.enabled,
                    task_name: NEWS_MONITOR_TASK_NAME.to_string(),
                    interval_minutes: raw.interval_minutes,
                    last_run_at: raw.last_run_at,
                    next_run_at: raw.next_run_at,
                    last_task_result: raw.last_task_result,
                    needs_repair,
                };
            }
        }
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
    }
}

#[cfg(test)]
mod tests {
    use super::{build_task_xml, normalize_interval_minutes};
    use std::path::Path;

    #[test]
    fn builds_secure_user_scoped_task_xml() {
        let xml = build_task_xml(
            15,
            Path::new(r"C:\Users\joseo\AppData\Local\Atlas\_up_\runtime\atlas-news-monitor.exe"),
            "2026-11-12T08:35:00",
        );
        assert!(xml.contains("<Interval>PT15M</Interval>"));
        assert!(xml.contains("<LogonType>InteractiveToken</LogonType>"));
        assert!(xml.contains("<RunLevel>LeastPrivilege</RunLevel>"));
        assert!(xml.contains("<MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>"));
        assert!(xml.contains("<WakeToRun>false</WakeToRun>"));
        assert!(xml.contains("<ExecutionTimeLimit>PT5M</ExecutionTimeLimit>"));
        assert!(xml.contains("<Hidden>true</Hidden>"));
    }

    #[test]
    fn normalizes_disallowed_intervals_to_30() {
        assert_eq!(normalize_interval_minutes(15), 15);
        assert_eq!(normalize_interval_minutes(30), 30);
        assert_eq!(normalize_interval_minutes(60), 60);
        assert_eq!(normalize_interval_minutes(5), 30);
    }
}
