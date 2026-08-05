; 固定默认安装路径，与 productName 解耦。
; 背景：electron-builder NSIS 默认把安装目录叶子设为 ${productName}，
; 一旦改名（如 串口助手 → 串串）就会装到不同路径，导致老版本静默升级时
; 在新目录另装一份、旧的残留。这里强制固定为 %LOCALAPPDATA%\Programs\SAEcom，
; 使应用显示名（productName / shortcutName / 窗口标题）可随意调整而不影响升级路径。
;
; preInit 在 NSIS 脚本最早期、选择 per-user/per-machine 上下文之后、
; 渲染安装目录页之前执行，是覆盖 $INSTDIR 默认值的标准钩子。
!macro customPreInit
  ; per-user（perMachine=false）下 $INSTDIR 默认基于 ${LOCALAPPDATA}，
  ; 用 SetShellVarContext current 确保取到的是当前用户目录。
  SetShellVarContext current
  StrCpy $INSTDIR "$LOCALAPPDATA\Programs\SAEcom"
!macroend
