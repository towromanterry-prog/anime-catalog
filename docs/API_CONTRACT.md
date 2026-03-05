# API_CONTRACT

## General
- JSON-only.
- Strict error format.
- Each response includes meta.requestId and an `X-Request-Id` header.
- Pagination is offset/limit; offset resets to 0 on any filter change.

## Error Format (strict)
{
  "error": "STRING_CODE",
  "message": "Human readable",
  "statusCode": 400,
  "details": { }
}

## GET /api/catalog
Response:
{
  "data": [MediaSummary],
  "meta": {
    "requestId": "uuid",
    "cache": {
      "key": "y:2026:s:SPRING",
      "stale": true,
      "refreshing": true,
      "ageSeconds": 12345,
      "ttlSeconds": 172800,
      "updatedAt": "ISO",
      "lastError": null
    },
    "paging": { "offset": 0, "limit": 40, "total": 1234 }
  }
}

Notes:
- `total` is produced by SQLite COUNT(*) with the same filters.
- Sorting must be stable: tie-break by id.

## GET /api/title/:id
Returns cached details or lazily fetched-and-cached details.

## GET /api/suggest/tags?q=
- q length bounded
- returns suggestions from SQLite
- rate-limited

## Auth
GET /api/auth/anilist/start
GET /api/auth/anilist/callback
GET /api/auth/me
POST /api/auth/logout

## User
GET /api/me/list
POST /api/me/list/refresh
GET /api/me/flags
PUT /api/me/flags/:mediaId

## Admin
GET /api/admin/cache
POST /api/admin/cache/refresh?year=&season=