#!/usr/bin/env bash
# Выкладка ЛингвоГероя на сервер (запускать из корня репозитория в Git Bash или Linux).
# Код едет архивом (без content/store — живое хранилище выпусков лежит на сервере в
# ~/lingvohero-data), на сервере: сборка образа, миграции, перезапуск API и воркера.
# Секреты (~/lingvohero-data/api.env, db.env) и данные этот скрипт не трогает.
set -euo pipefail

HOST="${DEPLOY_HOST:-dima@95.216.139.14}"
KEY="${DEPLOY_KEY:-$HOME/key_hetzner_wa}"
SSH=(ssh -i "$KEY" -o BatchMode=yes -o ServerAliveInterval=30 "$HOST")

cd "$(dirname "$0")/.."
archive="$(mktemp -d)/code.tgz"
git ls-files -co --exclude-standard | grep -v '^content/store/' | tar -czf "$archive" -T -
echo ">>> upload $(du -h "$archive" | cut -f1)"
scp -i "$KEY" -o BatchMode=yes "$archive" "$HOST:lingvohero-code.tgz"

"${SSH[@]}" 'bash -s' <<'REMOTE'
set -euo pipefail
# Свежая копия кода рядом со старой, затем замена: удалённые из репозитория файлы не остаются.
rm -rf ~/lingvohero.next && mkdir ~/lingvohero.next
tar -xzf ~/lingvohero-code.tgz -C ~/lingvohero.next && rm ~/lingvohero-code.tgz
rm -rf ~/lingvohero.prev && mv ~/lingvohero ~/lingvohero.prev && mv ~/lingvohero.next ~/lingvohero
cd ~/lingvohero/deploy
echo ">>> build"
docker compose build api
echo ">>> migrate"
docker compose up -d --wait db
# </dev/null: этот скрипт сам читается из stdin, и `run` иначе съел бы его остаток (перезапуск).
docker compose run --rm -T api node node_modules/tsx/dist/cli.mjs apps/api/src/cli/migrate.ts </dev/null
echo ">>> delivery copies"
# Уменьшенные копии картинок для приложения; повторный запуск ничего не делает.
docker compose run --rm -T api node node_modules/tsx/dist/cli.mjs apps/api/src/cli/renditions.ts </dev/null
echo ">>> restart"
docker compose up -d --wait api worker
docker compose ps
REMOTE
echo ">>> deployed"
