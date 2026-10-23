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

  const currentHost = typeof window !== 'undefined' ? window.location.hostname : '';

  // 1. If currently accessing from localhost or loopback, ALWAYS use localhost (prevents stale network IP)
  if (currentHost === 'localhost' || currentHost === '127.0.0.1') {
    return 'localhost';
  }

  // 2. Server mode explicitly configured
  try {
    const mode = localStorage.getItem('np_app_mode');
    if (mode === 'server') return 'localhost';
  } catch (e) { /* localStorage may be unavailable */ }

  // 3. For LAN browser clients: use the exact hostname/IP they connected through in browser
  if (currentHost && currentHost !== '' && currentHost !== '0.0.0.0') {
    return currentHost;
  }

  // 4. Saved server IP (only for desktop apps or Electron file:// where window.location.hostname is empty)
  try {
    const saved = localStorage.getItem('np_server_ip');
    if (saved && saved !== '127.0.0.1' && saved !== 'localhost') return saved;
  } catch (e) { /* localStorage may be unavailable */ }

  return 'localhost';
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
 * Safe fetch wrapper that attempts getApiBase() and falls back to relative path (Vite proxy) or direct localhost if needed.
 */
export const safeApiFetch = async (urlOrPath: string, options?: RequestInit): Promise<Response> => {
  const isFullPath = urlOrPath.startsWith('http://') || urlOrPath.startsWith('https://');
  const primaryUrl = isFullPath ? urlOrPath : `${getApiBase()}${urlOrPath.startsWith('/') ? urlOrPath : `/${urlOrPath}`}`;

  try {
    const res = await fetch(primaryUrl, options);
    return res;
  } catch (primaryErr) {
    if (!isFullPath && typeof window !== 'undefined') {
      const relPath = urlOrPath.startsWith('/') ? urlOrPath : `/${urlOrPath}`;
      try {
        // Fallback 1: Vite proxy relative path
        const res = await fetch(relPath, options);
        return res;
      } catch {
        // Fallback 2: Direct localhost:3001
        try {
          const res = await fetch(`http://localhost:3001${relPath}`, options);
          return res;
        } catch {
          throw primaryErr;
        }
      }
    }
    throw primaryErr;
  }
};

/**
 * Get the stored JWT token from sessionStorage or localStorage.
 */
export const getToken = (): string | null => {
  try {
    const token = sessionStorage.getItem('np_token') || localStorage.getItem('np_token');
    if (!token || token === 'null' || token === 'undefined') return null;
    return token;
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
  if (token && token !== 'null' && token !== 'undefined') {
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
