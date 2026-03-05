# AI_RULES (SaaS-ready, no billing) — Node/Express + better-sqlite3 + Vue3

These rules apply to any AI-generated changes for this repo.

## Scope & Change Control
1. Only change what the task requires. No drive-by refactors.
2. Never change API response shapes unless explicitly requested.
3. Never change DB schema unless explicitly requested AND provide a migration plan.
4. If asked for “full file”, return full file. If asked for “diff”, return unified diff.

## Core Architecture (Non-negotiable)
5. Catalog must be served from SQLite. AniList is ONLY for refresh jobs.
6. Excluding tags/genres MUST be done via SQL. Do NOT use AniList `tag_not_in` / `genre_not_in` for catalog output.
7. SWR rules:
   - cache fresh: serve from SQLite
   - cache stale: serve from SQLite immediately + refresh in background
   - cache missing: serve a live page + start full refresh in background
   - refresh failures must not break serving cached data
8. Sorting must be stable (tie-break by `id`).

## Backend Implementation Rules (Express + better-sqlite3)
9. Read path must be fast and synchronous via better-sqlite3 prepared statements.
10. All multi-table writes must use SQLite transactions.
11. Outbound AniList requests must use timeouts + retry w/ backoff for 429/5xx.
12. Add concurrency limits for refresh jobs (avoid exceeding AniList rate limits).
13. Never log tokens/cookies/session ids/auth codes.

## Auth & Security
14. Never store AniList tokens on the client (no localStorage/sessionStorage).
15. Use httpOnly cookies for sessions. Enforce SameSite + Origin checks; add CSRF token only if needed.
16. Validate all query params via whitelist + bounds (limit, arrays length, string length).
17. Sanitize AniList HTML descriptions on the client (mandatory).

## Observability & Ops
18. Implement structured logs with `request_id`; include `user_id` when authenticated.
19. Health/readiness endpoints must reflect DB connectivity and background-job liveliness.
20. Document any new env vars in `.env.example`.

If any rule conflicts with a task request, explain the conflict before writing code.