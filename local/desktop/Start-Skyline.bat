@echo off
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel% equ 0 (
  py -3 skyline.py
) else (
  python skyline.py
)
if errorlevel 1 echo Skyline requires Python 3.10 or newer. Download Python from https://www.python.org/downloads/
pause
