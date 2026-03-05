# SECURITY

## Sessions (httpOnly cookies)
- Session cookie is httpOnly.
- Secure=true in production.
- SameSite=Lax by default.
- Rotate session id on login.
- Idle + absolute lifetime (documented).
- Sessions stored in SQLite.

## CSRF
Primary:
- SameSite cookie + Origin/Referer check on state-changing requests.
Escalation (only if cross-site is needed):
- Double-submit CSRF token.

## AniList OAuth
- Authorization Code flow.
- Validate `state`.
- Do not expose token to client.
- Store AniList token encrypted-at-rest using TOKEN_ENC_KEY from env.
- Never log tokens, cookies, session ids, authorization codes.

## Input Validation
- Whitelist and bound all query params.
- Cap list sizes and string lengths.
- Rate-limit abuse-prone endpoints.

## XSS
- AniList descriptions are HTML.
- Client must sanitize before render.
- Optional defense-in-depth: server sanitization for stored details.
- Recommend CSP for production.

## Secrets
- No secrets committed to repo.
- `.env.example` lists all required vars.