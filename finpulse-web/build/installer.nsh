!macro customUnInstall
  !ifdef __UNINSTALL__
    DetailPrint "Dissolving license and unbinding device from network..."
    ExecWait 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\uninstall_unbind.ps1"'
  !endif
!macroend
