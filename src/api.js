const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";
const TOKEN_KEY = "analytics_tokens";
const USER_KEY = "analytics_user";

class ApiError extends Error {
  constructor(message, status, payload) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

function buildQuery(params) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      search.set(key, value);
    }
  });
  const query = search.toString();
  return query ? `?${query}` : "";
}

function loadTokens() {
  const raw = localStorage.getItem(TOKEN_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveTokens(tokens) {
  localStorage.setItem(TOKEN_KEY, JSON.stringify(tokens));
}

function saveUser(user) {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function getStoredUser() {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function logout() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

async function refreshTokens() {
  const tokens = loadTokens();
  if (!tokens?.refresh) return null;
  const response = await fetch(`${API_BASE_URL}/auth/refresh/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh: tokens.refresh }),
  });

  if (!response.ok) {
    logout();
    return null;
  }

  const payload = await response.json();
  const data = payload.data || payload;
  const updated = {
    access: data.access,
    refresh: data.refresh || tokens.refresh,
  };
  saveTokens(updated);
  return updated;
}

async function request(path, options = {}, { auth = false, retry = true } = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  if (auth) {
    const tokens = loadTokens();
    if (tokens?.access) {
      headers.Authorization = `Bearer ${tokens.access}`;
    }
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });

  if (response.status === 401 && auth && retry) {
    const refreshed = await refreshTokens();
    if (refreshed) {
      return request(path, options, { auth, retry: false });
    }
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const message = payload.error || payload.message || "Request failed.";
    throw new ApiError(message, response.status, payload);
  }

  return response.json();
}

// The Node API returns standard responses as { success, message, data }, while
// the analytics endpoints return their payload at the top level. Supporting
// both shapes keeps the dashboard compatible with either backend.
function unwrapData(payload) {
  return payload?.data ?? payload;
}

export async function login({ email, password }) {
  const response = await request(
    "/auth/login/",
    {
      method: "POST",
      body: JSON.stringify({ email, password }),
    },
    { auth: false }
  );
  const payload = unwrapData(response);

  if (!payload.tokens?.access || !payload.tokens?.refresh) {
    throw new ApiError("Login failed. Missing tokens.", 500, payload);
  }

  saveTokens(payload.tokens);
  if (payload.user) {
    saveUser(payload.user);
  }
  return payload.user || null;
}

export async function fetchProfile() {
  const response = await request("/auth/profile/", { method: "GET" }, { auth: true });
  const data = unwrapData(response);
  if (data) {
    saveUser(data);
  }
  return data;
}

export async function fetchAnalyticsSummary({ startDate, endDate, subjectId }) {
  const query = buildQuery({
    start_date: startDate,
    end_date: endDate,
    subject_id: subjectId,
  });
  return request(`/analytics/summary/${query}`, { method: "GET" }, { auth: true });
}

export async function fetchTopUsers({ startDate, endDate, page = 1, pageSize = 40 }) {
  const query = buildQuery({
    start_date: startDate,
    end_date: endDate,
    page,
    page_size: pageSize,
  });
  return request(`/analytics/top-users/${query}`, { method: "GET" }, { auth: true });
}

export async function fetchManagedUsers({
  search = "",
  plan = "",
  startDate = "",
  endDate = "",
  page = 1,
  pageSize = 20,
}) {
  const query = buildQuery({
    search,
    plan,
    start_date: startDate,
    end_date: endDate,
    page,
    page_size: pageSize,
  });
  return request(`/analytics/users/${query}`, { method: "GET" }, { auth: true });
}

export async function banManagedUser(userId) {
  const response = await request(
    `/analytics/users/${encodeURIComponent(userId)}/ban/`,
    { method: "POST" },
    { auth: true }
  );
  return response.user;
}

export async function unbanManagedUser(userId) {
  const response = await request(
    `/analytics/users/${encodeURIComponent(userId)}/unban/`,
    { method: "POST" },
    { auth: true }
  );
  return response.user;
}

export async function fetchManagedUser(userId) {
  const response = await request(
    `/analytics/users/${encodeURIComponent(userId)}/`,
    { method: "GET" },
    { auth: true }
  );
  return response.user;
}

export async function updateManagedUser(userId, updates) {
  const response = await request(
    `/analytics/users/${encodeURIComponent(userId)}/`,
    {
      method: "PATCH",
      body: JSON.stringify(updates),
    },
    { auth: true }
  );
  return response.user;
}

export async function deleteManagedUser(userId) {
  return request(
    `/analytics/users/${encodeURIComponent(userId)}/`,
    { method: "DELETE" },
    { auth: true }
  );
}

export async function deleteManagedUsers(userIds) {
  return request(
    "/analytics/users/",
    {
      method: "DELETE",
      body: JSON.stringify({ user_ids: userIds }),
    },
    { auth: true }
  );
}

export async function sendBroadcastNotification({ title, body, tier = "" }) {
  const response = await request(
    "/analytics/notifications/broadcast/",
    {
      method: "POST",
      body: JSON.stringify({ title, body, tier: tier || null }),
    },
    { auth: true }
  );
  return unwrapData(response);
}

export async function fetchNotificationStatus() {
  const response = await request(
    "/analytics/notifications/status/",
    { method: "GET" },
    { auth: true }
  );
  return unwrapData(response);
}
