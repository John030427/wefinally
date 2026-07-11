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
set PATCHES=patch-002-partner-audit.sql patch-004-free-whitelist.sql patch-005-meet-report.sql patch-006-appearance-llm.sql patch-007-register-ux.sql patch-008-match-psych-report.sql patch-009-safety-whitelist-audit.sql patch-010-meet-safety-share.sql patch-011-match-handoff-ticket.sql patch-012-admin-service-role.sql patch-013-member-review.sql

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

for %%P in (%PATCHES%) do (
  set PATCH_SQL=%SCRIPT_DIR%%%P
  call :RUN_PATCH "%%P"
)

echo.
echo 数据库导入完成。默认管理员: admin / admin123456
pause
exit /b 0

:RUN_PATCH
set PATCH_NAME=%~1
if exist "%PATCH_SQL%" (
  echo.
  echo [patch] 导入 %PATCH_NAME% ...
  if "%DB_PASS%"=="" (
    mysql -h %DB_HOST% -P %DB_PORT% -u %DB_USER% < "%PATCH_SQL%"
  ) else (
    mysql -h %DB_HOST% -P %DB_PORT% -u %DB_USER% -p%DB_PASS% < "%PATCH_SQL%"
  )
  if errorlevel 1 (
    echo [警告] %PATCH_NAME% 导入失败，可稍后手动执行
  ) else (
    echo [完成] %PATCH_NAME%
  )
) else (
  echo [跳过] 未找到 %PATCH_NAME%
)
exit /b 0
