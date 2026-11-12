!macro NSIS_HOOK_PREUNINSTALL
  nsExec::ExecToLog 'schtasks.exe /Delete /TN "Atlas Invest - News Monitor" /F'
!macroend
