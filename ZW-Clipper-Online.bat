@echo off
title ZW Clipper - ONLINE
color 0B
cd /d C:\zw-clipper

echo.
echo  ============================================
echo        Z W   C L I P P E R   -   O N L I N E
echo  ============================================
echo.

REM --- Descargar cloudflared si no existe ---
if not exist "cloudflared.exe" (
  echo  Primera vez: descargando cloudflared...
  echo  Si Windows Defender lo bloquea, permitilo: es seguro (es de Cloudflare).
  curl -L -o cloudflared.exe https://github.com/cloudflare/cloudflared/releases/download/2025.11.1/cloudflared-windows-amd64.exe
  echo  Listo.
  echo.
)

echo  Actualizando a la ultima version...
git pull
echo.

echo  Arrancando el servidor en segundo plano...
start "ZW Clipper Server" /min cmd /c "npm run dev"

echo  Esperando que el servidor levante...
timeout /t 8 >nul

echo.
echo  ============================================
echo   Creando tu link publico...
echo   El link aparece abajo (https://...trycloudflare.com)
echo   Copialo y abrilo desde cualquier compu o celular.
echo  ============================================
echo.
echo  (No cierres esta ventana mientras uses la app)
echo.

cloudflared.exe tunnel --url http://localhost:3000
