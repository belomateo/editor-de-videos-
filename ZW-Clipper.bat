@echo off
title ZW Clipper
color 0E
cd /d C:\zw-clipper

echo.
echo  ====================================
echo            Z W   C L I P P E R
echo  ====================================
echo.
echo  Actualizando a la ultima version...
git pull
echo.
echo  Arrancando el servidor...
echo  (No cierres esta ventana mientras uses la app)
echo.

REM Espera 4 segundos y abre el navegador automaticamente
start "" cmd /c "timeout /t 4 >nul && start http://localhost:3000"

npm run dev
