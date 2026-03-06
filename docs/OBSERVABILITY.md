# OBSERVABILITY

## Request Id
- Accept inbound X-Request-Id or generate one.
- Return X-Request-Id header and include it in meta.requestId.

## Logs (structured)
Minimum fields:
- ts, level, msg
- request_id
- route, method, status
- duration_ms
- user_id (if auth)
- cache_key (for catalog)
- job_id (for refresh jobs)

## Metrics (recommended)
Expose /metrics (Prometheus) if desired:
- http_requests_total{route,status}
- http_request_duration_ms{route}
- catalog_cache_age_seconds{cache_key}
- refresh_jobs_total{type,result}
- refresh_job_duration_seconds{type}
- anilist_requests_total{status}
- anilist_rate_limited_total