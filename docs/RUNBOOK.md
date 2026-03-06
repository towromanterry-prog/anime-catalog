# RUNBOOK

## AniList rate limits (429)
- Reduce refresh concurrency.
- Increase backoff and jitter.
- Ensure refresh never blocks catalog reads.

## Refresh stuck
- If refreshing=true longer than REFRESH_STUCK_SECONDS:
  - allow takeover
  - log incident with cache_key/user_id
  - check lastError

## DB locked / slow
- Verify WAL mode if enabled.
- Ensure refresh writes are in short transactions.
- Check indexes and query plans.
- Reduce concurrent refresh jobs.

## Auth issues (401 spike)
- Check cookie Secure/SameSite mismatch.
- Verify session DB table health.
- Verify TOKEN_ENC_KEY did not change unintentionally.

## XSS/HTML issues
- Confirm sanitize is applied on client render.
- Consider adding CSP.