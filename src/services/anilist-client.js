import pLimit from 'p-limit';
import { config } from '../config.js';

const limit = pLimit(config.anilistConcurrency);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function anilistRequest({ query, variables = {}, accessToken, requestId }) {
  return limit(async () => {
    for (let attempt = 0; attempt <= config.anilistMaxRetries; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), config.anilistTimeoutMs);

      try {
        const response = await fetch(config.anilistUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
          },
          body: JSON.stringify({ query, variables }),
          signal: controller.signal
        });

        clearTimeout(timeout);

        // retry budget only for rate-limit / server errors
        if ((response.status === 429 || response.status >= 500) && attempt < config.anilistMaxRetries) {
          await sleep(300 * (attempt + 1) ** 2);
          continue;
        }

        // HTTP-level failure: try to surface GraphQL errors from body (AniList often returns { errors: [...] })
        if (!response.ok) {
          try {
            const data = await response.json();
            if (data && Array.isArray(data.errors)) {
              return { error: 'AniList GraphQL error', status: response.status, details: data.errors, data: null };
            }
          } catch (_) {
            // ignore JSON parse errors and fall back
          }

          return { error: `AniList error ${response.status}`, status: response.status, data: null };
        }

        // HTTP ok: still may contain GraphQL errors
        let payload;
        try {
          payload = await response.json();
        } catch (e) {
          return {
            error: 'AniList invalid JSON response',
            status: 502,
            details: { message: e.message, requestId },
            data: null
          };
        }

        if (payload && Array.isArray(payload.errors)) {
          return { error: 'AniList GraphQL error', status: response.status, details: payload.errors, data: null };
        }

        return { data: payload?.data ?? null, error: null, status: response.status };
      } catch (error) {
        clearTimeout(timeout);

        if (attempt < config.anilistMaxRetries) {
          await sleep(300 * (attempt + 1) ** 2);
          continue;
        }

        return {
          error: 'AniList request failed',
          status: 502,
          details: { message: error.message, requestId },
          data: null
        };
      }
    }

    return { error: 'AniList retry budget exhausted', status: 502, data: null };
  });
}
