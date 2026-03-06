# ARCHITECTURE

## Goals (SaaS-ready)
- Fast catalog queries after warmup (SQLite read path).
- Resilient refresh: AniList failures/rate limits never take the service down.
- Secure auth: tokens never reach the client; sessions are server-managed.
- Operational readiness: logs/health/runbooks enable production support.

## Trust Boundaries
- Client is untrusted.
- Backend is trusted.
- AniList is an external dependency and may fail/ratelimit.

## Data Flow
Catalog read:
Client -> Express API -> SQLite (better-sqlite3 sync read) -> Response

Catalog refresh:
Client/admin/scheduler -> API trigger -> background refresh job
-> AniList GraphQL -> SQLite transaction writes -> cache_keys updated

User list:
Client -> API -> SQLite (user cache) -> Response
Stale -> background sync -> AniList -> SQLite

## SWR Contract (strict)
- Serve cached data immediately from SQLite.
- If stale: refresh in background, do not block responses.
- If missing: serve a live page and start a full refresh in background.
- Preserve previous cache on refresh failure; set lastError in cache_keys/user_sync_keys.

## Caching Keys
- cache_key: `y:{year}:s:{season}`
- season != ALL: TTL 48h
- season == ALL: TTL 72h
- user list TTL: 15–60 minutes (project decision)

## Multi-tenant
- `users.id` is tenant boundary.
- Every user-scoped query MUST include `user_id`.
- Admin routes MUST be protected by role/allowlist.

## Background Jobs & Locks (DB-based)
- Refresh jobs must be idempotent.
- Lock per cache_key via cache_keys.refreshing + refreshStartedAt.
- Lock per user via user_sync_keys.refreshing + refreshStartedAt.
- Stuck refresh takeover: if `now - refreshStartedAt > REFRESH_STUCK_SECONDS`, allow takeover.

## Forbidden
- AniList as primary catalog output source.
- AniList server-side exclusion for tags/genres.
- Tokens on client.
- Blocking refresh on request path.
- Schema changes without explicit migration.