# Check list

## Автотесты
- `npm test` — unit/smoke для health/ready/error format.

## Ручные тесты
1. Запустить `npm run dev`.
2. Проверить `GET /api/health`, `GET /api/ready`.
3. Проверить `/api/catalog` с фильтрами и лимитами (`limit<=80`, `excludeTags<=50`, `excludeGenres<=20`).
4. Проверить `/api/suggest/tags?q=nar` и rate limit.
5. Проверить `/api/admin/cache` и `/api/admin/cache/refresh` c `x-admin-key`.
6. Пройти OAuth flow `/api/auth/anilist/start` -> callback -> `/api/auth/me`.
7. Проверить `/api/me/list` SWR и `/api/me/list/refresh`.
8. Проверить `/api/me/flags` и `PUT /api/me/flags/:mediaId` (note <= 500).
9. Проверить user-фильтры в `/api/catalog`: `myStatus`, `notInMyList`, `watchLaterOnly`, `showHidden`.
10. Проверить `GET /api/title/:id` (из кеша или lazy fetch AniList).
