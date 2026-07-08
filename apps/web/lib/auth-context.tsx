'use client';

import { createContext, useContext } from 'react';

interface AuthContextValue {
  token: string | null;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Retorna o contexto de autenticação admin. Lança erro se usado fora do
 * AuthContext.Provider — previne bugs silenciosos onde um componente usa
 * `token` como sempre null e finge funcionar.
 */
export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (ctx === null) {
    throw new Error('useAuth deve ser usado dentro de AuthContext.Provider');
  }
  return ctx;
};
