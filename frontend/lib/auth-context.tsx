'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { api, setToken, clearToken } from './api';
import { AuthUser, LoginResponse } from './types';

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  pendingSystemNps: boolean;
  dismissSystemNps: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const USER_STORAGE_KEY = 'pulseone_user';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingSystemNps, setPendingSystemNps] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const stored = window.localStorage.getItem(USER_STORAGE_KEY);
    if (stored) {
      try {
        setUser(JSON.parse(stored));
      } catch {
        window.localStorage.removeItem(USER_STORAGE_KEY);
      }
    }
    setLoading(false);
  }, []);

  async function login(email: string, password: string) {
    const res = await api.post<LoginResponse>('/auth/login', { email, password });
    setToken(res.accessToken);
    window.localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(res.user));
    setUser(res.user);
    // NPS do sistema (pedido do Erick): fica guardado em memória (não em
    // localStorage) — some sozinho se a página recarregar, e o modal só
    // aparece de novo no PRÓXIMO login de verdade, nunca só por atualizar
    // a página.
    setPendingSystemNps(res.pendingSystemNps ?? false);

    if (res.mustChangePwd) {
      router.push('/change-password');
    } else {
      router.push('/dashboard');
    }
  }

  function dismissSystemNps() {
    setPendingSystemNps(false);
  }

  function logout() {
    // Fire-and-forget: só pra registrar o LOGOUT em auditoria (PRD seção
    // 25). Nunca deve bloquear nem impedir o logout local — se a chamada
    // falhar (rede, token já expirado etc.), a pessoa sai do sistema mesmo
    // assim, só sem esse registro específico.
    api.post('/auth/logout').catch(() => {});

    clearToken();
    window.localStorage.removeItem(USER_STORAGE_KEY);
    setUser(null);
    setPendingSystemNps(false);
    router.push('/login');
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, pendingSystemNps, dismissSystemNps }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth precisa estar dentro de um AuthProvider.');
  return ctx;
}
