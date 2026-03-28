# Degram Backend (PostgreSQL)

- Node `http` + `pg` (пул соединений)
- API: `/api/*`
- Миграции: `backend/db/schema.sql` (идемпотентные `CREATE IF NOT EXISTS`)

## Локально

1. Подними PostgreSQL (Docker и т.п.).
2. Скопируй `backend/.env.example` в `backend/.env` и задай **`POSTGRES_URL`** или **`DATABASE_URL`**.
3. Из корня репозитория:

```powershell
npm install
npm run migrate
npm run dev
```

API: `http://localhost:3002` (порт `PORT`).

Фронт в dev (`vite`) проксирует `/api` на backend — см. `frontend/vite.config.ts`.

## Переменные окружения

| Переменная | Описание |
|------------|----------|
| `POSTGRES_URL` | **Обязательно.** Строка подключения PostgreSQL |
| `POSTGRES_URL_NON_POOLING` | Опциональный fallback |
| `DATABASE_URL` | Альтернативное имя для строки подключения |
| `PG_SSL_REJECT_UNAUTHORIZED` | По умолчанию `false` для managed Postgres; `true` если цепочка сертификата доверена в рантайме |
| `AUTH_SECRET` | Секрет для сессионных токенов |
| `CORS_ORIGIN` | Например `*` или URL фронта |
| `PORT` | Только локальный dev (по умолчанию 3002) |

См. также `backend/.env.example` (TonConnect `SIGN_DATA_*`, TON API и т.д.).

## Продакшен

Скрипты в корневом `package.json` и конфиг деплоя в корне репозитория задают сборку. В окружении хостинга укажи `POSTGRES_URL` / `DATABASE_URL`, `AUTH_SECRET`, `CORS_ORIGIN` и остальное по `.env.example`.

Фронт обычно ходит на **`/api`** с того же origin — `VITE_API_URL` не нужен, если API не вынесен на отдельный домен.
