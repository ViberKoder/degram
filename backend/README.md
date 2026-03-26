# Degram Backend (PostgreSQL)

Production-ready storage: **PostgreSQL** (рекомендуется **Neon** — serverless Postgres, хорошо дружит с Vercel).

- Node `http` + `pg` (пул соединений)
- API тот же, что и у фронта: `/api/*`
- Миграции схемы: `backend/db/schema.sql` (идемпотентные `CREATE IF NOT EXISTS`)

## Локально

1. Подними Postgres (Docker, Neon dev branch, Supabase local и т.д.).
2. Скопируй `backend/.env.example` в `backend/.env` (или экспортируй переменные) и задай **`DATABASE_URL`**.
3. Из корня репозитория `Degram/`:

```powershell
npm install
npm run migrate
npm run dev
```

API: `http://localhost:3002` (порт `PORT`).

Фронт в dev (`vite`) проксирует `/api` на `127.0.0.1:3002` — см. `frontend/vite.config.ts`.

## Переменные окружения

| Переменная | Описание |
|------------|----------|
| `DATABASE_URL` | **Обязательно.** PostgreSQL connection string |
| `AUTH_SECRET` | Секрет для сессионных токенов |
| `CORS_ORIGIN` | `*` или `https://<твой-проект>.vercel.app` |
| `PORT` | Только локальный dev (по умолчанию 3002) |

## Vercel

См. корневой `vercel.json` и `package.json` в `Degram/`.

- **Build:** `npm run build` — применяет миграции к БД и собирает `frontend/dist`.
- **Runtime:** serverless-функция `api/[...path].js` проксирует все запросы к `backend/handler.js` (включён `includeFiles` для папки `backend/`).

В проекте Vercel добавь в **Environment Variables**:

- `DATABASE_URL` — строка из Neon (или другого Postgres).
- `AUTH_SECRET` — случайная длинная строка.
- `CORS_ORIGIN` — URL твоего деплоя на Vercel (или `*` на время тестов).

Фронт в проде ходит на **`/api`** (тот же origin) — в `frontend/.env` **`VITE_API_URL` не нужен** (или пустой).

## Дальше для сотен тысяч пользователей

- Реплики чтения, PgBouncer, кэш (Redis) для hot paths, keyset-пагинация вместо загрузки больших срезов в память — по мере роста нагрузки.
