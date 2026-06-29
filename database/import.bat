@echo off
chcp 65001 >nul
setlocal

echo ========================================
echo  WeFinally 数据库导入脚本
echo ========================================
echo.

set /p DB_HOST=MySQL 主机 [127.0.0.1]: 
if "%DB_HOST%"=="" set DB_HOST=127.0.0.1

set /p DB_PORT=MySQL 端口 [3306]: 
if "%DB_PORT%"=="" set DB_PORT=3306

set /p DB_USER=MySQL 用户名 [root]: 
if "%DB_USER%"=="" set DB_USER=root

set /p DB_PASS=MySQL 密码: 

set SCRIPT_DIR=%~dp0
set INIT_SQL=%SCRIPT_DIR%init.sql
set PATCH_SQL=%SCRIPT_DIR%patch-002-partner-audit.sql

if not exist "%INIT_SQL%" (
  echo [错误] 找不到 init.sql: %INIT_SQL%
  exit /b 1
)

echo.
echo [1/2] 导入 init.sql ...
if "%DB_PASS%"=="" (
  mysql -h %DB_HOST% -P %DB_PORT% -u %DB_USER% < "%INIT_SQL%"
) else (
  mysql -h %DB_HOST% -P %DB_PORT% -u %DB_USER% -p%DB_PASS% < "%INIT_SQL%"
)
if errorlevel 1 (
  echo [错误] init.sql 导入失败
  exit /b 1
)
echo [完成] init.sql

if exist "%PATCH_SQL%" (
  echo.
  echo [2/2] 导入 patch-002-partner-audit.sql ...
  if "%DB_PASS%"=="" (
    mysql -h %DB_HOST% -P %DB_PORT% -u %DB_USER% < "%PATCH_SQL%"
  ) else (
    mysql -h %DB_HOST% -P %DB_PORT% -u %DB_USER% -p%DB_PASS% < "%PATCH_SQL%"
  )
  if errorlevel 1 (
    echo [警告] patch 导入失败，可稍后手动执行
  ) else (
    echo [完成] patch-002
  )
)

echo.
echo 数据库导入完成。默认管理员: admin / admin123456
pause
