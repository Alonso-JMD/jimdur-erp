@echo off
setlocal EnableExtensions
chcp 65001 >nul 2>&1
title JIMDUR - Exportar inventario de SQL Server
cd /d "%~dp0"

echo.
echo ====================================================
echo   JIMDUR - EXPORTADOR DE INVENTARIO SQL SERVER
echo   VERSION 10 - COMPATIBLE CON WINDOWS POWERSHELL
echo ====================================================
echo.
echo Iniciando desde:
echo %CD%
echo.

if not exist "%~dp0JIMDUR_EXPORTAR_SQL_SERVER.ps1" (
    echo ERROR: Falta JIMDUR_EXPORTAR_SQL_SERVER.ps1
    echo.
    echo Debes extraer COMPLETAMENTE el ZIP y conservar juntos
    echo los archivos JIMDUR_EXPORTAR.cmd y
    echo JIMDUR_EXPORTAR_SQL_SERVER.ps1.
    goto :finish_error
)

where powershell.exe >nul 2>&1
if errorlevel 1 (
    echo ERROR: Windows PowerShell no esta disponible en esta PC.
    goto :finish_error
)

echo Abriendo el asistente. Espera unos segundos...
echo.
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0JIMDUR_EXPORTAR_SQL_SERVER.ps1"
set "JIMDUR_EXIT=%ERRORLEVEL%"

echo.
if not "%JIMDUR_EXIT%"=="0" (
    echo EL EXPORTADOR TERMINO CON UN ERROR.
    echo Codigo: %JIMDUR_EXIT%
    echo Toma una foto de este mensaje para recibir soporte.
) else (
    echo El proceso termino correctamente.
)
goto :finish

:finish_error
set "JIMDUR_EXIT=1"

:finish
echo.
echo Esta ventana no se cerrara sola.
echo Presiona una tecla solamente cuando hayas leido el resultado.
pause >nul
exit /b %JIMDUR_EXIT%
