/**
 * Centralized API Layer — Single Source of Truth
 * ================================================
 * All API calls in the app MUST go through this module.
 * Eliminates the 3 duplicate getApiBase() functions that caused glitches.
 */

/**
 * Determine the API host based on app mode and saved config.
 * Priority: 
 *   1. Server mode → always localhost
 *   2. Saved server IP from localStorage
 *   3. Current window hostname (for browser clients accessing server IP directly)
 *   4. Fallback to localhost
 */
export const getApiHost = (): string => {
  // 0. Cloud Web App Mode (Vercel/Netlify)
  if (import.meta.env && import.meta.env.VITE_PROD_API_URL) {
    return import.meta.env.VITE_PROD_API_URL;
  }

  try {
    const mode = localStorage.getItem('np_app_mode');
    if (mode === 'server') return 'localhost';
  } catch (e) { /* localStorage may be unavailable */ }

  try {
    const saved = localStorage.getItem('np_server_ip');
    if (saved) return saved;
  } catch (e) { /* localStorage may be unavailable */ }

  // For browser clients: use the hostname they connected through
  const host = window.location.hostname;
  return (host && host !== '') ? host : '127.0.0.1';
};

/**
 * Returns the full base URL for all API calls.
 * e.g., "http://192.168.1.10:3001" or "http://localhost:3001"
 */
export const getApiBase = (): string => {
  // If deployed to the web, use the cloud backend URL
  if (import.meta.env && import.meta.env.VITE_PROD_API_URL) {
    return import.meta.env.VITE_PROD_API_URL;
  }

  const host = getApiHost();
  if (host.startsWith('http://') || host.startsWith('https://')) return host;
  return `http://${host}:3001`;
};

/**
 * Get the stored JWT token from sessionStorage.
 */
export const getToken = (): string | null => {
  try {
    return sessionStorage.getItem('np_token');
  } catch (e) {
    return null;
  }
};

/**
 * Build authorization headers with the current JWT token.
 */
export const authHeaders = (): Record<string, string> => {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  // Bypass localtunnel warning page
  headers['bypass-tunnel-reminder'] = 'true';
  return headers;
};

/**
 * Make an authenticated GET request to the API.
 */
export const apiGet = async (path: string, options?: RequestInit): Promise<Response> => {
  const url = `${getApiBase()}${path}`;
  return fetch(url, {
    ...options,
    headers: {
      ...authHeaders(),
      ...(options?.headers || {}),
    },
  });
};

/**
 * Make an authenticated POST request to the API.
 */
export const apiPost = async (path: string, body?: unknown, options?: RequestInit): Promise<Response> => {
  const url = `${getApiBase()}${path}`;
  return fetch(url, {
    method: 'POST',
    ...options,
    headers: {
      ...authHeaders(),
      ...(options?.headers || {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
};

/**
 * Make an authenticated PATCH request to the API.
 */
export const apiPatch = async (path: string, body?: unknown, options?: RequestInit): Promise<Response> => {
  const url = `${getApiBase()}${path}`;
  return fetch(url, {
    method: 'PATCH',
    ...options,
    headers: {
      ...authHeaders(),
      ...(options?.headers || {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
};

/**
 * Make an authenticated DELETE request to the API.
 */
export const apiDelete = async (path: string, options?: RequestInit): Promise<Response> => {
  const url = `${getApiBase()}${path}`;
  return fetch(url, {
    method: 'DELETE',
    ...options,
    headers: {
      ...authHeaders(),
      ...(options?.headers || {}),
    },
  });
};
export const getAuthToken = getToken;
