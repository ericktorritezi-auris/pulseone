'use client';

import { useState, FormEvent } from 'react';
import { useAuth } from '../../lib/auth-context';

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao entrar.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-p-bg px-4">
      <div className="w-full max-w-sm bg-white rounded-xl shadow-sm border border-slate-200 p-8">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold text-p-primary-dark">
            Pulse<span className="text-p-secondary">One</span>
          </h1>
          <p className="text-sm text-p-neutral mt-1">Transformando percepções em desenvolvimento.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-p-primary-dark mb-1">E-mail</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-p-primary"
              placeholder="seuemail@empresa.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-p-primary-dark mb-1">Senha</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-p-primary"
              placeholder="••••••••"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-p-primary text-white py-2.5 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-60"
          >
            {submitting ? 'Entrando...' : 'Entrar'}
          </button>

          <a href="/forgot-password" className="block text-center text-sm text-p-primary hover:underline">
            Esqueci minha senha
          </a>
          <a href="/cadastro" className="block text-center text-sm text-p-neutral hover:underline">
            Não tem conta? Cadastre-se
          </a>
        </form>
      </div>
    </div>
  );
}
