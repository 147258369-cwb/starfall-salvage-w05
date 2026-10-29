@echo off
cd /d "%~dp0"
where python >nul 2>nul
if %errorlevel%==0 (
  python serve.py 8000
) else (
  echo Python not found. Install Python 3, or run: npx http-server -p 8000
  pause
)
