const BASE = '/api';

async function request(path, options = {}) {
  const headers = { ...options.headers };
  if (options.body) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${BASE}${path}`, { ...options, headers });

  let data;
  try {
    data = await res.json();
  } catch {
    if (!res.ok) throw new Error(`Request failed: ${res.status}`);
    return null;
  }

  if (!res.ok) {
    throw new Error(data.error || `Request failed: ${res.status}`);
  }

  return data;
}

// SMTP Accounts
export const smtpApi = {
  list: () => request('/smtp-accounts'),
  create: (account) => request('/smtp-accounts', { method: 'POST', body: JSON.stringify(account) }),
  test: (id) => request(`/smtp-accounts/${id}/test`, { method: 'POST' }),
  setDefault: (id) => request(`/smtp-accounts/${id}/default`, { method: 'PUT' }),
  remove: (id) => request(`/smtp-accounts/${id}`, { method: 'DELETE' }),
};

// Templates
export const templateApi = {
  list: () => request('/templates'),
  create: (template) => request('/templates', { method: 'POST', body: JSON.stringify(template) }),
  update: (id, template) => request(`/templates/${id}`, { method: 'PUT', body: JSON.stringify(template) }),
  remove: (id) => request(`/templates/${id}`, { method: 'DELETE' }),
};

// Recipient Lists
export const recipientApi = {
  list: () => request('/recipient-lists'),
  get: (id) => request(`/recipient-lists/${id}`),
  create: (list) => request('/recipient-lists', { method: 'POST', body: JSON.stringify(list) }),
  remove: (id) => request(`/recipient-lists/${id}`, { method: 'DELETE' }),
};

// Dispatches
export const dispatchApi = {
  list: (filters = {}) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(filters)) {
      if (v) params.append(k, v);
    }
    const qs = params.toString();
    return request(`/dispatches${qs ? '?' + qs : ''}`);
  },
  create: (dispatch) => request('/dispatches', { method: 'POST', body: JSON.stringify(dispatch) }),
  logs: (id) => request(`/dispatches/${id}/logs`),
  retry: (id) => request(`/dispatches/${id}/retry`, { method: 'POST' }),
  remove: (id) => request(`/dispatches/${id}`, { method: 'DELETE' }),
  cancelScheduled: (id) => request(`/dispatches/${id}/cancel`, { method: 'POST' }),
  exportLogsUrl: (id) => `/api/dispatches/${id}/logs/export`,
};

// Health
export const healthApi = {
  check: () => request('/health'),
};
