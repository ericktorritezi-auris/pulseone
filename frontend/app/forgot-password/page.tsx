'use client';

import { useState, FormEvent } from 'react';
import { api } from '../../lib/api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post('/auth/forgot-password', { email });
    } finally {
      setSubmitting(false);
      setSent(true); // Sempre mostra sucesso — não revela se o e-mail existe (segurança)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-p-bg px-4">
      <div className="w-full max-w-sm bg-white rounded-xl shadow-sm border border-slate-200 p-8">
        <h1 className="text-lg font-semibold text-p-primary-dark mb-1">Esqueci minha senha</h1>

        {sent ? (
          <p className="text-sm text-p-neutral mt-4">
            Se o e-mail informado estiver cadastrado, você vai receber um link de redefinição em instantes.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            <div>
              <label className="block text-sm font-medium text-p-primary-dark mb-1">E-mail</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-p-primary"
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-p-primary text-white py-2.5 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-60"
            >
              {submitting ? 'Enviando...' : 'Enviar link de redefinição'}
            </button>
            <a href="/login" className="block text-center text-sm text-p-primary hover:underline">
              Voltar ao login
            </a>
          </form>
        )}
      </div>
    </div>
  );
}
