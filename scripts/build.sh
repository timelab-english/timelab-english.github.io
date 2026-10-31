#!/usr/bin/env bash
# TIME LAB · production-сборка в dist/
# Читает настройки из переменных окружения или из файла .env (если он есть).
# Использование: bash scripts/build.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/dist"

if [[ -f "$ROOT/.env" ]]; then
  set -a; # shellcheck disable=SC1091
  . "$ROOT/.env"; set +a
fi

SUPABASE_URL="${SUPABASE_URL:-}"
SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY:-}"
GOOGLE_AUTH="${GOOGLE_AUTH:-false}"
SITE_URL="${SITE_URL:-}"
BASE_PATH="${BASE_PATH:-/}"

fail() { echo "build: $*" >&2; exit 1; }

# --- проверки настроек ---
[[ "$BASE_PATH" == /* && "$BASE_PATH" == */ ]] || fail "BASE_PATH должен начинаться и заканчиваться на / (например /timelab/)"
[[ "$BASE_PATH" =~ ^[A-Za-z0-9._/~-]+$ ]] || fail "BASE_PATH содержит недопустимые символы"
if [[ -n "$SUPABASE_URL" || -n "$SUPABASE_ANON_KEY" ]]; then
  [[ "$SUPABASE_URL" =~ ^https://[A-Za-z0-9.-]+(:[0-9]+)?/?$ ]] || fail "SUPABASE_URL должен выглядеть как https://xxxx.supabase.co"
  [[ "$SUPABASE_ANON_KEY" =~ ^[A-Za-z0-9._-]+$ ]] || fail "SUPABASE_ANON_KEY содержит недопустимые символы"
  [[ "$SUPABASE_ANON_KEY" != sb_secret_* ]] || fail "это секретный ключ (sb_secret_...). В браузер можно только anon/publishable"
  # JWT-ключ: проверяем, что это роль anon, а не service_role
  if [[ "$SUPABASE_ANON_KEY" == *.*.* ]]; then
    payload="$(echo "$SUPABASE_ANON_KEY" | cut -d. -f2 | tr '_-' '/+')"
    while (( ${#payload} % 4 )); do payload="${payload}="; done
    decoded="$(echo "$payload" | base64 --decode 2>/dev/null || echo "$payload" | base64 -D 2>/dev/null || true)"
    [[ "$decoded" != *service_role* ]] || fail "это ключ service_role. Его нельзя публиковать — нужен anon"
  fi
else
  echo "build: SUPABASE_URL/SUPABASE_ANON_KEY не заданы — сборка будет работать в гостевом режиме"
fi
[[ "$GOOGLE_AUTH" == "true" || "$GOOGLE_AUTH" == "false" ]] || fail "GOOGLE_AUTH: true или false"
[[ -z "$SITE_URL" || "$SITE_URL" =~ ^https?://[A-Za-z0-9.:/_~-]+$ ]] || fail "SITE_URL должен быть адресом вида https://user.github.io/timelab/"

# --- сборка ---
rm -rf "$OUT"
mkdir -p "$OUT/js"
cp "$ROOT/index.html" "$OUT/index.html"
for f in data engine verbs speech app cloud account; do cp "$ROOT/js/$f.js" "$OUT/js/$f.js"; done
cat > "$OUT/js/config.js" <<CFG
// создано scripts/build.sh — не редактировать вручную
window.TIMELAB_CONFIG = {
  supabaseUrl: "${SUPABASE_URL%/}",
  supabaseAnonKey: "${SUPABASE_ANON_KEY}",
  googleAuth: ${GOOGLE_AUTH},
  siteUrl: "${SITE_URL}"
};
CFG
# версии файлов в адресах скриптов: после обновления сайта браузер не возьмёт старый код из кеша
hash_of() { if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | cut -c1-10; else shasum -a 256 "$1" | cut -c1-10; fi; }
for f in config data engine verbs speech app cloud account; do
  h="$(hash_of "$OUT/js/$f.js")"
  sed "s#src=\"js/$f.js\"#src=\"js/$f.js?v=$h\"#" "$OUT/index.html" > "$OUT/index.tmp" && mv "$OUT/index.tmp" "$OUT/index.html"
done
# 404.html для GitHub Pages: перенаправляет вложенный путь на hash-маршрут
sed "s#__BASE_PATH__#${BASE_PATH}#g" "$ROOT/404.html" > "$OUT/404.html"
touch "$OUT/.nojekyll"

# --- контроль результата ---
for f in index.html 404.html js/config.js js/data.js js/engine.js js/verbs.js js/speech.js js/app.js js/cloud.js js/account.js; do
  [[ -s "$OUT/$f" ]] || fail "нет файла dist/$f"
done
grep -q 'src="js/account.js?v=' "$OUT/index.html" || fail "index.html не подключает js/account.js"
if grep -rqiE 'service_role|sb_secret_' "$OUT/js/config.js"; then fail "в config.js попал секретный ключ"; fi
if command -v node >/dev/null 2>&1; then
  for f in "$OUT"/js/*.js; do node --check "$f" || fail "синтаксическая ошибка в $f"; done
  echo "build: синтаксис JS проверен (node --check)"
fi
echo "build: готово → dist/ (BASE_PATH=$BASE_PATH, облако: $([[ -n "$SUPABASE_URL" ]] && echo включено || echo выключено))"
