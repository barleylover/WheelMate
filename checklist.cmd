@echo off
setlocal EnableExtensions EnableDelayedExpansion

chcp 65001 >nul
set "PYTHONIOENCODING=utf-8"
set "SCRIPT_DIR=%~dp0"
set "SCRIPT=%SCRIPT_DIR%previsit_checklist.py"
set "BUNDLED_PY=C:\Users\0woo.DESKTOP-KHUF7OG\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"

if not exist "%SCRIPT%" (
  echo previsit_checklist.py not found in "%SCRIPT_DIR%"
  set "EXIT_CODE=1"
  goto finish
)

if exist "%BUNDLED_PY%" (
  set "PYTHON_EXE=%BUNDLED_PY%"
) else (
  where py >nul 2>nul
  if not errorlevel 1 (
    set "PYTHON_EXE=py"
  ) else (
    where python >nul 2>nul
    if not errorlevel 1 (
      set "PYTHON_EXE=python"
    ) else (
      echo Python not found. Install Python or use the bundled Codex runtime.
      set "EXIT_CODE=1"
      goto finish
    )
  )
)

if "%~1"=="" (
  echo.
  echo Seocho wheelchair pre-visit checklist MVP
  echo.
  echo Usage:
  echo   checklist.cmd "your Korean query here"
  echo   checklist.cmd "your Korean query here" --radius 1200
  echo   checklist.cmd --help
  echo.
  echo See USAGE_EXAMPLES.md for Korean examples.
  echo.
  set /p USER_QUERY=Enter query: 
  if "!USER_QUERY!"=="" (
    echo Empty query. Exiting.
    set "EXIT_CODE=1"
    goto finish
  )
  "%PYTHON_EXE%" "%SCRIPT%" "!USER_QUERY!"
  set "EXIT_CODE=!ERRORLEVEL!"
) else (
  "%PYTHON_EXE%" "%SCRIPT%" %*
  set "EXIT_CODE=!ERRORLEVEL!"
)

:finish
echo.
if not "%CHECKLIST_NO_PAUSE%"=="1" (
  pause
)
endlocal
exit /b %EXIT_CODE%
