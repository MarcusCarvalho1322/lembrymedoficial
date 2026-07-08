/**
 * @module API Client
 * @description Fetch wrapper para comunicação com a API Railway.
 *
 * Auth: usamos cookie httpOnly+Secure+SameSite=None (defesa contra XSS) +
 * Authorization header (back-compat). Sempre enviamos `X-Requested-With`
 * para satisfazer o guard CSRF do backend em requests mutantes que cheguem
 * só via cookie.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

interface FetchOptions extends RequestInit {
  token?: string;
}

export async function api<T = any>(path: string, options: FetchOptions = {}): Promise<T> {
  const { token, headers: customHeaders, ...rest } = options;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest', // satisfaz guard CSRF do backend
    ...customHeaders as Record<string, string>,
  };

  // '__cookie__' é um sentinela do layout admin que indica "estou autenticado
  // via cookie httpOnly". Não enviamos Authorization nesse caso — o backend
  // lê o cookie automaticamente (credentials:'include').
  if (token && token !== '__cookie__') {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_URL}${path}`, {
    headers,
    credentials: 'include', // envia/recebe cookies cross-site
    ...rest,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Erro desconhecido' }));
    throw new Error(error.error || `HTTP ${res.status}`);
  }

  return res.json();
}

/** Login admin — retorna JWT (cookie httpOnly também é setado pelo backend) */
export async function adminLogin(email: string, password: string): Promise<string> {
  const data = await api<{ token: string }>('/admin/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  return data.token;
}

/** Logout — limpa cookie no backend e estado no client (caller). */
export async function adminLogout(): Promise<void> {
  try {
    await api('/admin/logout', { method: 'POST' });
  } catch {
    // ok — logout é best-effort do lado do client
  }
}

/** GET /admin/me — verifica se há sessão válida (via cookie). */
export async function adminMe(): Promise<{ email: string }> {
  return api<{ email: string }>('/admin/me');
}
