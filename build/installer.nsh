; 自定义 NSIS 脚本 — 开机自启清除
; 卸载前执行 OpenClaw Desktop.exe --clear-login-item 清除系统登录项

!macro customUnInit
  ; 卸载前清除开机自启（文件尚未删除，exe 仍存在）
  IfFileExists "$INSTDIR\OpenClaw Desktop.exe" 0 +2
  ExecWait '"$INSTDIR\OpenClaw Desktop.exe" --clear-login-item' $0
!macroend
