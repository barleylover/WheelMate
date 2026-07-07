@echo off
setlocal EnableExtensions

if "%~1"=="" (
  echo Usage:
  echo   build_image.cmd registry_host image_name image_tag
  echo.
  echo Example:
  echo   build_image.cmd ghcr.io your-github-user/seocho-accessibility-mcp 0.1.0
  exit /b 1
)
if "%~2"=="" (
  echo image_name is required.
  exit /b 1
)
if "%~3"=="" (
  echo image_tag is required.
  exit /b 1
)

set "REGISTRY_HOST=%~1"
set "IMAGE_NAME=%~2"
set "IMAGE_TAG=%~3"
set "FULL_IMAGE=%REGISTRY_HOST%/%IMAGE_NAME%:%IMAGE_TAG%"

docker --version >nul 2>nul
if errorlevel 1 (
  echo Docker CLI not found. Install Docker Desktop or run this on a machine with Docker.
  exit /b 1
)

echo Building %FULL_IMAGE%
docker build -t "%FULL_IMAGE%" .
if errorlevel 1 exit /b 1

echo.
echo Built image:
echo   %FULL_IMAGE%
echo.
echo Next:
echo   docker push %FULL_IMAGE%

endlocal
