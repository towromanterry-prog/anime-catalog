# OPERATIONS

## Runtime model (VPS)
- Nginx serves the built frontend and reverse-proxies /api to Node.
- Node runs as a systemd service.
- SQLite DB lives on persistent disk.

## Deploy steps (high-level)
1) Build frontend (Vite) -> deploy static assets
2) Deploy backend -> restart systemd unit
3) Run DB migrations if any (versioned)
4) Verify /api/health and /api/ready
5) Verify catalog read path returns quickly

## SQLite
- Use WAL mode for better concurrency (project choice).
- Backups:
  - daily snapshot via sqlite3 .backup or filesystem snapshot
  - keep last N backups
- Restore procedure documented in RUNBOOK.

## Background refresh
- Only one refresh per cache_key at a time (DB lock fields).
- Only one user sync per user at a time.

## Nginx
- Long cache headers for hashed assets.
- index.html should be no-cache or short cache.
- gzip/brotli if available.

## systemd
- Restart=on-failure
- EnvironmentFile pointing to .env in prod
- Graceful shutdown on SIGTERM