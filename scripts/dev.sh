#!/usr/bin/env bash
# TIME LAB · локальный запуск: собирает dist/ и запускает статический сервер.
# Использование: bash scripts/dev.sh [порт]   (по умолчанию 8080)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${1:-8080}"
BASE_PATH=/ bash "$ROOT/scripts/build.sh"
echo "TIME LAB: http://localhost:$PORT/"
exec python3 -m http.server "$PORT" --bind 127.0.0.1 --directory "$ROOT/dist"
