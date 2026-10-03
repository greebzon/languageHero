# Деплой ЛингвоГероя

Прод: сервер `95.216.139.14` (Debian 13), вход:

```bash
ssh -i ~/key_hetzner_wa dima@95.216.139.14
```

На этом же сервере работает chatmill: docker compose в `~/app/deploy`. Его контейнер с Caddy держит порты 80 и 443 и сам выпускает сертификаты Let's Encrypt. ЛингвоГерой — отдельный compose-проект `lingvohero`:

| Сервис   | Что делает                                                                                                   |
| -------- | ------------------------------------------------------------------------------------------------------------ |
| `db`     | PostgreSQL 17. Порт не публикуется, приложение ходит под ролью `lingvohero_app` без суперправ.               |
| `api`    | API и админ-панель на `/admin/`. Подключён к сети chatmill `botplatform_botnet` под именем `lingvohero-api`. |
| `worker` | Очередь генерации (OpenAI).                                                                                  |

Caddy chatmill проксирует `lang.chatmill.app` на `lingvohero-api:3001`. Блок в `~/app/deploy/Caddyfile`:

```caddyfile
lang.chatmill.app {
	encode zstd gzip
	redir / /admin/ 302
	reverse_proxy lingvohero-api:3001
}
```

Этот файл принадлежит репозиторию chatmill. Блок нужно добавить и туда, иначе следующий деплой chatmill его сотрёт. Перезагрузка Caddy без простоя:

```bash
docker exec botplatform-app-1 frankenphp reload --config /etc/frankenphp/Caddyfile --adapter caddyfile
```

## Файлы на сервере

- `~/lingvohero` — код; каждая выкладка заменяет его целиком, предыдущая копия лежит в `~/lingvohero.prev`.
- `~/lingvohero-data/api.env`, `db.env` — секреты, права 600. Образцы: `apps/api/.env.production.example`, `deploy/postgres-init.sh`.
- `~/lingvohero-data/content-store` — опубликованные выпуски (то, что раздаёт `/v1/catalog`).
- `~/lingvohero-data/drafts` — файлы панели.
- Том `lingvohero_pg_data` — база.

## Выкладка

Из корня репозитория:

```bash
bash deploy/push.sh
```

Скрипт выполняет по порядку:

1. Упаковывает код из git вместе с новыми неигнорируемыми файлами, без `content/store`.
2. Заменяет им `~/lingvohero` на сервере.
3. Собирает образ.
4. Применяет миграции.
5. Перезапускает API и воркер.

Данные и секреты он не трогает.

API не запустится с `NODE_ENV=production`, если конфигурация небезопасна (`productionProblems` в `apps/api/src/env.ts`). Причина будет в логе:

```bash
docker compose logs api
```

## Полезное

```bash
cd ~/lingvohero/deploy
docker compose ps
docker compose logs -f --tail 50 api worker
docker compose exec db psql -U lingvohero_app -d lingvohero      # консоль базы
docker compose run --rm -T api node node_modules/tsx/dist/cli.mjs apps/api/src/cli/admin-password.ts admin   # новый пароль админа (спросит дважды; без TTY — ADMIN_NEW_PASSWORD)
```

Резервная копия базы:

```bash
docker compose exec -T db pg_dump -U lingvohero_app lingvohero | gzip > ~/lingvohero-backup-$(date +%F).sql.gz
```

Регулярные копии базы и `~/lingvohero-data` пока не настроены (этап E плана админки).
