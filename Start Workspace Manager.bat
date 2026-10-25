@echo off
setlocal
title Public Workspace Manager
py -3 -c "import sys; sys.exit(sys.version_info < (3, 10))" >nul 2>&1
if not errorlevel 1 (
    py -3 "%~dp0launch.py" %*
    goto finished
)
python -c "import sys; sys.exit(sys.version_info < (3, 10))" >nul 2>&1
if not errorlevel 1 (
    python "%~dp0launch.py" %*
    goto finished
)
echo Python 3.10 or newer is required. Install Python and enable its PATH option.
echo Then double-click this launcher again.
pause
exit /b 1
:finished
if errorlevel 1 pause
