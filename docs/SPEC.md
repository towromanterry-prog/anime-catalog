# SPEC.md — Anime Catalog Web (AniList + SQLite + Sync) — SaaS-ready (no billing)

Ниже — цельное ТЗ “с нуля” для нового проекта (web-каталог + кэш + авторизация + синхронизация + интеграция со списками AniList). Можно класть в репу как SPEC.md.

---

## 1) Назначение и цель

Веб-приложение для просмотра сезонных аниме-релизов и поиска тайтлов с гибкими фильтрами. Данные берутся из AniList GraphQL, но выдача и фильтрация выполняются локально из SQLite-кэша. Дополнительно реализуются:

- вход через AniList,
- импорт пользовательских списков (watching/completed/dropped/…),
- персональные метки “посмотреть позже/скрыть/избранное/заметки” с синхронизацией между устройствами.

---

## 2) Роли и сценарии

### 2.1 Гость

- Открывает каталог, фильтрует, сортирует, смотрит карточки и детали тайтла.
- Может пользоваться пресетами фильтров.
- Может делиться ссылкой (URL содержит фильтры).

### 2.2 Авторизованный пользователь (AniList)

- Видит бейдж “мой статус” (watching/completed/dropped/…).
- Может фильтровать каталог по своим статусам.
- Может помечать тайтлы: “посмотреть позже”, “скрыть”, “избранное”, “заметка”.
- Эти метки сохраняются на сервере и синхронизируются между устройствами.
- Может вручную запустить обновление своего списка.

### 2.3 Администратор (опционально)

- Видит статус кэша каталога и пользовательских синков.
- Может запускать refresh вручную.
- Может видеть ошибки refresh (lastError).

---

## 3) Функциональные требования: каталог

### 3.1 Параметры по умолчанию

- format: TV + ONA
- status: RELEASING + FINISHED
- sort: averageScore desc
- limit: 40

### 3.2 Фильтры каталога

Обязательные фильтры:

- Год (year)
- Сезон (WINTER/SPRING/SUMMER/FALL/ALL)
- Статус (multi)
- Формат (multi)
- Adult (boolean)
- Исключить жанры (exclude genres, multi)
- Исключить теги (exclude tags, multi + автокомплит)
- Только новые (без приквела)
- Только продолжения (есть приквел)

Пользовательские (после входа):

- Мой статус (watching/completed/dropped/planning/paused/repeating) + вариант “не в моём списке”
- Только “посмотреть позже”
- Не показывать “скрытые” (или тумблер “показывать скрытые”)

### 3.3 Сортировка

Минимально:

- score desc / score asc

Опционально:

- popularity desc / asc
- id desc / asc (служебно)

Сортировка должна быть стабильной (tie-break по id).

### 3.4 Пагинация

Один режим на выбор (фиксируется в проекте):

- offset/limit пагинация
или
- infinite scroll (под капотом всё равно offset/limit)

Поведение:

- при смене любого фильтра offset сбрасывается в 0.

---

## 4) Карточки и детали тайтла

### 4.1 Карточка в гриде

Поля:

- cover (обложка)
- title (userPreferred)
- averageScore
- genres (несколько штук, с переносом/ellipsis)
- format + status
- кнопка “Открыть на AniList” (siteUrl)

Дополнительно для авторизованного:

- бейдж “мой статус” (если тайтл есть в списке)
- быстрые иконки: watchLater, hidden (и/или favorite)

### 4.2 Детали тайтла (модалка или отдельная страница)

- описание (HTML → обязательно sanitize на клиенте)
- расширенные поля (минимум: теги, формат, статус, score, жанры, ссылку)
- кнопка “Открыть на AniList”
- управление локальными метками (watchLater/hidden/favorite/note)
- отображение прогресса/оценки из AniList (если есть)

---

## 5) Интеграция AniList: данные и логика

### 5.1 Базовый каталог

Получение базовых полей из AniList:

- id
- title.userPreferred
- siteUrl
- coverImage.large
- averageScore
- format
- status
- isAdult
- genres
- tags(name,rank,category,isAdult,isSpoiler)
- season
- seasonYear

### 5.2 Локальная фильтрация по тегам/жанрам

Запрещено использовать server-side исключение тегов на AniList для выдачи (например tag_not_in). Исключения выполняются SQL-ом по локальным таблицам.

### 5.3 “Только новые / продолжения”

Основано на наличии relationType=PREQUEL. Реализация:

- в момент refresh кэша каталога отдельным батч-запросом по id_in догружаются relations.edges.relationType
- hasPrequel сохраняется в SQLite (0/1/NULL)

---

## 6) Кэширование и обновления (SQLite + SWR)

### 6.1 Кэш-ключи и TTL

Ключ: `y:{year}:s:{season}`

- season != ALL → TTL 48 часов
- season == ALL → TTL 72 часа

### 6.2 SWR (stale-while-revalidate)

- Каталог из SQLite отдаётся сразу.
- Если кэш устарел — запускается refresh в фоне, не блокируя ответ.
- Если кэш отсутствует — отдаётся “live-страница” (текущий offset/limit) и параллельно стартует фоновый полный refresh.

### 6.3 Ограничения AniList и устойчивость

- уважать rate limits (минимальный интервал, ограничение concurrency)
- обработка 429/5xx: retry c backoff
- ошибки refresh не ломают выдачу: старый кэш остаётся доступен, фиксируется lastError

---

## 7) Авторизация и синхронизация

### 7.1 Вход

OAuth2 Authorization Code через AniList.

На вебе — сессионная авторизация через httpOnly cookie (предпочтительно).

Токен AniList хранить на сервере в зашифрованном виде (ключ в env).

### 7.2 Импорт списка пользователя

После входа backend подтягивает MediaList (anime) и складывает в локальную таблицу user_media_list.

Обновление списка пользователя тоже SWR (TTL 15–60 минут, по проектному решению).

На карточках отображать статус пользователя.

### 7.3 Локальные метки пользователя

- watchLater (хочу посмотреть)
- hidden (скрыть)
- favorite (опционально)
- note (опционально)

Хранение в БД проекта, синхронизация по аккаунту.

---

## 8) Админ-возможности

- Статус кэша каталога: ключи, updatedAt, ttl, refreshing, lastError
- Ручной запуск refresh для (year, season)
- Статус синка пользователя (опционально)

---

## 9) Backend API

### 9.1 Публичные

- GET /api/catalog — отфильтрованный список из SQLite  
  Возвращает meta.cache (stale/refreshing/age/ttl).
- GET /api/title/:id — детали (из кэша или лениво из AniList)
- GET /api/suggest/tags?q= — автокомплит тегов из SQLite
- GET /api/meta — сезоны/форматы/статусы (+ жанры при желании)
- GET /api/health

### 9.2 Auth

- GET /api/auth/anilist/start
- GET /api/auth/anilist/callback
- GET /api/auth/me
- POST /api/auth/logout

### 9.3 Пользовательские

- GET /api/me/list — статусы из AniList (из локального user кэша)
- POST /api/me/list/refresh — запустить синк
- GET /api/me/flags — локальные метки
- PUT /api/me/flags/:mediaId — обновить метки

### 9.4 Админ

- GET /api/admin/cache
- POST /api/admin/cache/refresh?year=&season=

Ошибки API должны быть единообразны:

`{ error, message, statusCode, details? }`.

---

## 10) Модель данных (SQLite)

### 10.1 Каталог

- media(
  id PK,
  year,
  season,
  title,
  siteUrl,
  coverLarge,
  averageScore,
  format,
  status,
  isAdult,
  has_prequel,
  updatedAt,
  genres_json opt
)
- media_genres(media_id, genre) PK(media_id,genre)
- media_tags(media_id, tag_name) PK(media_id,tag_name), rank, category, isAdult, isSpoiler
- cache_keys(cache_key PK, updatedAt, ttlSeconds, refreshing, refreshStartedAt, lastError)

Теги сохраняются только при rank >= TAG_RANK_THRESHOLD (default 40).

### 10.2 Пользователь

- users(id PK, anilist_id unique, anilist_name, token_enc, createdAt, updatedAt)
- sessions(session_id PK, user_id FK, createdAt, expiresAt, lastSeenAt)
- user_media_list(user_id, media_id, status, progress, score, updatedAt) + индексы
- user_media_flags(user_id, media_id, watchLater, hidden, favorite opt, note opt, updatedAt) + индексы
- user_sync_keys(user_id PK, updatedAt, ttlSeconds, refreshing, lastError)

---

## 11) Frontend UI/UX

### 11.1 Страницы

- / или /catalog — каталог
- /title/:id (или модалка поверх каталога)
- /login (опционально, можно без отдельной)
- /admin (опционально, ограничить доступ)

### 11.2 URL-синхронизация

Все фильтры должны сериализоваться в query string и восстанавливаться при загрузке страницы.

### 11.3 Состояния

- loading (первичная загрузка)
- empty state (нет результатов)
- SWR-обновление: ненавязчивый индикатор “обновляется в фоне”
- error state: понятное сообщение + “повторить”

---

## 12) Нефункциональные требования

- Производительность: повторные запросы каталога после прогрева должны быть быстрыми (SQLite read).
- Надёжность: refresh не должен падать от единичных ошибок страниц.
- Безопасность: токены не на клиенте; cookie httpOnly; защита от CSRF (Origin/SameSite + при необходимости CSRF token).
- Логи: ошибки refresh и причины 429/5xx должны логироваться.
- Развёртывание: nginx + systemd для API; фронт раздаётся как статические файлы.

---

## 13) Этапы разработки (DoD)

### v0.1 Каталог

- Каталог работает, фильтры/сортировка/пагинация, детали, URL-синк.
- SQLite-кэш + SWR refresh, admin cache статус.

### v0.2 Авторизация + импорт AniList списка

- Вход через AniList, /api/auth/me.
- Импорт user list, бейджи статуса на карточках, фильтр “мой статус”.

### v0.3 Локальные метки + синхронизация

- watchLater/hidden/favorite/note
- фильтры по этим меткам
- UI для управления метками

### v0.4 “Удобства”

- пресеты
- сохранённые фильтры
- быстрый поиск по названию (SQLite LIKE/FTS)

---

# 14) SaaS-ready дополнения (без биллинга)

Этот раздел фиксирует эксплуатационные гарантии и ограничения, чтобы сервис был устойчив в проде.

## 14.1 Consistency model (ожидаемое поведение устаревания)

- Данные каталога могут быть устаревшими до TTL (48–72h) и всё равно считаются валидными для UI.
- Данные пользовательского списка могут быть устаревшими до USER_TTL (15–60 минут).
- Во время фонового refresh пользователь может видеть “старые” данные до завершения обновления.
- Между обновлением каталога и пользовательского списка нет строгой консистентности: UI обязан терпеть расхождения.

## 14.2 Multi-instance и блокировки refresh

Сервис должен корректно работать при запуске нескольких инстансов (масштабирование по CPU/памяти):

- Для каталога одновременно допускается только один refresh на `cache_key`.
  - Лок: `cache_keys.refreshing = true` + `refreshStartedAt`.
- Для синка пользователя одновременно допускается только один refresh на `user_id`.
  - Лок: `user_sync_keys.refreshing = true` + timestamp.

### Stuck takeover (защита от “вечного refreshing”)
- Если `now - refreshStartedAt > REFRESH_STUCK_SECONDS`, refresh считается “залипшим”.
- Следующий запуск refresh имеет право “забрать” lock и продолжить обновление.
- Причина залипания должна логироваться, lastError обновляться.

## 14.3 Query budgets (anti-abuse и предсказуемая нагрузка)

Ограничения на параметры запросов (фиксируются и валидируются на API):

- `limit` max: 80 (default 40)
- `excludeTags` max: 50
- `excludeGenres` max: 20
- `includeTags` max: 50
- `includeGenres` max: 20
- `q` (для suggest) max length: 64
- количество фильтров multi (status/format/myStatus и т.п.) должно быть ограничено разумным максимумом (например 10–20).

## 14.4 Health vs Readiness

Нужно различать “процесс жив” и “сервис готов”:

- `GET /api/health` — процесс API жив (быстрый ответ, без тяжёлых проверок).
- `GET /api/ready` — сервис готов обслуживать запросы:
  - SQLite доступен/открывается
  - (опционально) проверка актуальности миграций/версии схемы
  - (опционально) нет фатального состояния, препятствующего работе read path

## 14.5 Минимальные требования к наблюдаемости

- Все ошибки refresh должны логироваться с причиной (429/5xx/parse/db/timeout).
- Логи должны содержать request_id; для user endpoints — user_id.
- Для `/api/catalog` логировать cache_key и cache state (fresh/stale/refreshing).

## 14.6 Безопасность (минимум)

- Токены AniList никогда не попадают на клиент.
- Сессии: httpOnly cookie + SameSite + Origin-check на state-changing.
- Описание тайтла — HTML: sanitize на клиенте обязателен.