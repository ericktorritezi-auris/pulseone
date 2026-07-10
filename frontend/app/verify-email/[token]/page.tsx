'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '../../../lib/api';

export default function VerifyEmailPage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .post(`/auth/verify-email/${params.token}`)
      .then(() => {
        setStatus('success');
        setTimeout(() => router.push('/login'), 2500);
      })
      .catch((err) => {
        setStatus('error');
        setError(err instanceof Error ? err.message : 'Não foi possível confirmar o e-mail.');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.token]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-p-bg px-4">
      <div className="w-full max-w-sm bg-white rounded-xl shadow-sm border border-slate-200 p-8 text-center">
        <h1 className="text-lg font-semibold text-p-primary-dark mb-3">
          Pulse<span className="text-p-secondary">One</span>
        </h1>

        {status === 'loading' && <p className="text-sm text-p-neutral">Confirmando seu e-mail...</p>}

        {status === 'success' && (
          <>
            <p className="text-sm text-p-success font-medium mb-1">E-mail confirmado com sucesso!</p>
            <p className="text-xs text-p-neutral">Redirecionando para o login...</p>
          </>
        )}

        {status === 'error' && (
          <>
            <p className="text-sm text-red-600 font-medium mb-3">{error}</p>
            <p className="text-xs text-p-neutral mb-4">
              Esse link pode já ter sido usado ou ter expirado (validade de 24 horas). Você já pode
              tentar fazer login normalmente — a confirmação de e-mail não impede o acesso.
            </p>
            <a href="/login" className="text-sm text-p-primary hover:underline">
              Ir para o login
            </a>
          </>
        )}
      </div>
    </div>
  );
}
