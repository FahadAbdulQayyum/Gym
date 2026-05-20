const { net } = require('electron');

const AUTH_TIMEOUT_MS = 30000;

function parseErrorMessage(body, status) {
  const text = String(body ?? '').trim();
  if (!text) {
    return `Request failed (${status})`;
  }
  try {
    const json = JSON.parse(text);
    return json.error || json.message || text;
  } catch {
    return text;
  }
}

function isNetworkError(error) {
  const message = String(error?.message ?? error ?? '');
  return (
    error?.name === 'AbortError' ||
    /fetch failed|network|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|abort/i.test(message)
  );
}

async function fetchAuth(apiConfig, path, body) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AUTH_TIMEOUT_MS);

  try {
    const response = await fetch(`${apiConfig.apiUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiConfig.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const raw = await response.text();
    if (!response.ok) {
      const error = new Error(parseErrorMessage(raw, response.status));
      error.status = response.status;
      throw error;
    }

    return JSON.parse(raw);
  } finally {
    clearTimeout(timeout);
  }
}

function canUseCloud() {
  return typeof net?.isOnline === 'function' ? net.isOnline() : true;
}

async function cloudLogin(apiConfig, username, password) {
  if (!canUseCloud()) {
    const error = new Error('Offline');
    error.offline = true;
    throw error;
  }

  const payload = await fetchAuth(apiConfig, '/api/auth/login', { username, password });
  return payload.user;
}

async function cloudSignup(apiConfig, username, password) {
  if (!canUseCloud()) {
    const error = new Error('Offline');
    error.offline = true;
    throw error;
  }

  const payload = await fetchAuth(apiConfig, '/api/auth/signup', { username, password });
  return payload.user;
}

async function cloudRegister(apiConfig, { id, username, password }) {
  if (!canUseCloud()) {
    const error = new Error('Offline');
    error.offline = true;
    throw error;
  }

  const payload = await fetchAuth(apiConfig, '/api/auth/register', { id, username, password });
  return payload.user;
}

module.exports = {
  cloudLogin,
  cloudSignup,
  cloudRegister,
  isNetworkError,
  canUseCloud,
};
