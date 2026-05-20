@echo off
chcp 65001 >nul
cd /d "D:\electric_meter_app\apkWithLogingSystem"
echo [%date% %time%] Starting Electricity Bill Server... >> server_log.txt
python -m http.server 8000 >> server_log.txt 2>&1