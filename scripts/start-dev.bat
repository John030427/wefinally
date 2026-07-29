@echo off
chcp 65001 >nul
echo ========================================
echo  WeFinally 一键本地启动（Windows）
echo ========================================
echo.

cd /d "%~dp0server"

if not exist node_modules (
  echo [1/3] 安装依赖...
  call npm install
) else (
  echo [1/3] 依赖已存在，跳过安装
)

if not exist .env (
  echo [2/3] 复制 .env.example 为 .env，请编辑数据库与微信配置
  copy .env.example .env
) else (
  echo [2/3] .env 已存在
)

echo [3/3] 启动服务 http://localhost:3000
echo   - 管理后台: http://localhost:3000/admin/
echo   - 合伙人:   http://localhost:3000/partner/
echo   - 合伙人注册: http://localhost:3000/partner/register.html
echo.
call npm start
