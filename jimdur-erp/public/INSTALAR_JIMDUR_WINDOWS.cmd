@echo off
setlocal
title JIMDUR ERP - Instalador
color 1F
echo.
echo  ================================================
echo        JIMDUR ERP - INSTALACION EN WINDOWS
echo  ================================================
echo.
echo  Creando accesos directos para este equipo...
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0INSTALAR_JIMDUR_WINDOWS.ps1"
if errorlevel 1 (
  echo.
  echo  No se pudo completar la instalacion.
  echo  Revisa el mensaje anterior o comunicate con soporte.
  echo.
  pause
  exit /b 1
)
echo.
echo  Instalacion terminada correctamente.
echo.
pause
exit /b 0
