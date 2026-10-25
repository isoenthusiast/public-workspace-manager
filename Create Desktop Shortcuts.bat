@echo off
setlocal
set "PWM_LAUNCHER=%~dp0Start Workspace Manager.bat"
powershell.exe -NoProfile -Command "$desktop = [Environment]::GetFolderPath('Desktop'); $shell = New-Object -ComObject WScript.Shell; $shortcut = $shell.CreateShortcut((Join-Path $desktop 'Public Workspace Manager.lnk')); $shortcut.TargetPath = $env:PWM_LAUNCHER; $shortcut.WorkingDirectory = Split-Path $env:PWM_LAUNCHER; $shortcut.Save(); $choose = $shell.CreateShortcut((Join-Path $desktop 'Choose workspace folder.lnk')); $choose.TargetPath = $env:PWM_LAUNCHER; $choose.Arguments = '--choose-folder'; $choose.WorkingDirectory = Split-Path $env:PWM_LAUNCHER; $choose.Save()"
if errorlevel 1 (
    echo Could not create shortcuts. You can still use Start Workspace Manager.bat.
) else (
    echo Desktop shortcuts created. Open Public Workspace Manager to start.
)
pause
