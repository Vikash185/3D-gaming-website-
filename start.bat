@echo off
rem Akuma Kage - local preview. Browsers block 3D models and modules on file://, so serve the folder.
rem Binds to all network interfaces so phones on the same Wi-Fi can open it too.
cd /d "%~dp0"
echo.
echo   Akuma Kage is running.
echo.
echo   On this PC:      http://localhost:8080
for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "(Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' -and $_.PrefixOrigin -eq 'Dhcp' } | Select-Object -First 1).IPAddress"`) do echo   On your phone:   http://%%i:8080
echo.
echo   (Phone must be on the same Wi-Fi. Keep this window open. Ctrl+C to stop.)
echo.
start "" http://localhost:8080
python -m http.server 8080 --bind 0.0.0.0
