#!/bin/bash
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/server"

echo "========================================"
echo " WeFinally 一键本地启动"
echo "========================================"

if [ ! -d node_modules ]; then
  echo "[1/3] npm install..."
  npm install
else
  echo "[1/3] 依赖已存在"
fi

if [ ! -f .env ]; then
  echo "[2/3] 复制 .env.example -> .env"
  cp .env.example .env
else
  echo "[2/3] .env 已存在"
fi

echo "[3/3] 启动 http://localhost:3000"
echo "  管理后台: /admin/"
echo "  合伙人:   /partner/"
npm start
