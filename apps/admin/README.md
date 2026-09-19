# Веб-панель разработчика

React + Vite, работает поверх `/v1/admin` того же Fastify-API. Реализованы этапы A–D из
[плана](../../docs/ADMIN_IMPLEMENTATION_PLAN.md): защищённый вход, языки, сеты, уроки трёх механик,
библиотека медиа, предпросмотр урока на движке `learning-core`, план выпуска с diff и публикация,
мастер «Черновик с ИИ» с очередью генерации (worker) и страницей хода работы. Бэкапы и полный
recovery — этап E.

## Запуск

Из корня репозитория (нужен Docker):

```powershell
cp apps/api/.env.example apps/api/.env   # DATABASE_URL уже указывает на compose-базу
pnpm db:up                                # PostgreSQL на 5433
pnpm db:migrate
pnpm admin:bootstrap admin                # пароль спросит в консоли (или ADMIN_BOOTSTRAP_PASSWORD)
pnpm admin:import                         # текущий content/store → база, повторно безопасно
pnpm dev:api                              # терминал 1
pnpm dev:admin                            # терминал 2 → http://localhost:5173/admin/
pnpm dev:worker                           # терминал 3 — только для генерации с ИИ
```

Собранная панель (`pnpm --filter @lingvohero/admin build`) раздаётся API по адресу
`http://127.0.0.1:3001/admin/`.

## Структура

```text
src/app/          роутер, API-клиент, сессия
src/features/     auth, languages, courses, lessons, media, preview, publications, generation
src/components/   общие элементы форм и уведомления
src/styles/       палитра мобильного приложения и раскладка
```

Контракты черновиков — `packages/contracts/src/admin.ts`; серверная часть — `apps/api/src/admin`,
`apps/api/src/publishing`, `apps/api/src/db`; генерация — `apps/api/src/generation` (провайдеры,
промпты, DTO) и `apps/api/src/worker` (очередь, стадии, цикл).
