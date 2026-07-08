/**
 * @module API Client
 * @description Fetch wrapper para comunicação com a API Railway.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

interface FetchOptions extends RequestInit {
  token?: string;
}

export async function api<T = any>(path: string, options: FetchOptions = {}): Promise<T> {
  const { token, headers: customHeaders, ...rest } = options;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...customHeaders as Record<string, string>,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_URL}${path}`, { headers, ...rest });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Erro desconhecido' }));
    throw new Error(error.error || `HTTP ${res.status}`);
  }

  return res.json();
}

/** Login admin — retorna JWT */
export async function adminLogin(email: string, password: string): Promise<string> {
  const data = await api<{ token: string }>('/admin/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  return data.token;
}

/** Pede código de recuperação via WhatsApp — retorna phone mascarado */
export async function adminForgotPassword(
  email: string,
): Promise<{ success: boolean; maskedPhone: string | null; message: string }> {
  return api('/admin/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

/** Valida código + define nova senha */
export async function adminResetPassword(
  email: string,
  code: string,
  newPassword: string,
): Promise<{ success: boolean; message: string }> {
  return api('/admin/reset-password', {
    method: 'POST',
    body: JSON.stringify({ email, code, newPassword }),
  });
}
