function genRequestId() {
  try {
    // Works in modern browsers (including most mobile webviews)
    return globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
  } catch {
    return Math.random().toString(36).slice(2);
  }
}

export async function apiFetch(path, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set('Accept', 'application/json');
  if (!headers.has('X-Request-Id')) headers.set('X-Request-Id', genRequestId());

  let body = options.body;
  const isJsonBody =
    body != null &&
    typeof body === 'object' &&
    !(body instanceof FormData) &&
    !(body instanceof Blob) &&
    !(body instanceof ArrayBuffer);

  if (isJsonBody) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(body);
  }

  const res = await fetch(path, {
    ...options,
    headers,
    body,
    credentials: 'include'
  });

  const text = await res.text();
  const json = text ? safeJsonParse(text) : null;

  if (!res.ok) {
    const err = new Error(json?.message || `Request failed (${res.status})`);
    err.statusCode = json?.statusCode || res.status;
    err.payload = json || { message: text };
    throw err;
  }

  return json;
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
