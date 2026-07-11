'use client';

import { useState } from 'react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth-context';

export function SystemNpsModal() {
  const { pendingSystemNps, dismissSystemNps } = useAuth();
  const [score, setScore] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!pendingSystemNps) return null;

  async function handleSubmit() {
    if (score === null) return;
    setSubmitting(true);
    setError('');
    try {
      await api.post('/system-nps/respond', { score, comment: comment.trim() || undefined });
      dismissSystemNps();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao enviar. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  }

  // "Agora não" nunca chama o backend — de propósito, sem deixar rastro
  // nenhum. A pesquisa volta a aparecer no próximo login (seção 5.41).
  function handleSkip() {
    dismissSystemNps();
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-p-primary-dark/50 px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-7">
        <h2 className="text-base font-bold text-p-primary-dark mb-1">O que você acha do PulseOne?</h2>
        <p className="text-sm text-p-neutral mb-5">
          De 0 a 10, o quanto você recomendaria o PulseOne para um colega de outra empresa?
        </p>

        <div className="grid grid-cols-11 gap-1 mb-1">
          {Array.from({ length: 11 }, (_, i) => i).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setScore(n)}
              className={`aspect-square rounded-lg text-xs font-semibold border transition-colors ${
                score === n
                  ? 'bg-p-primary text-white border-p-primary'
                  : 'bg-white text-p-neutral border-slate-200 hover:border-p-primary'
              }`}
            >
              {n}
            </button>
          ))}
        </div>
        <div className="flex justify-between text-[10px] text-p-neutral mb-5">
          <span>Pouco provável</span>
          <span>Muito provável</span>
        </div>

        <textarea
          rows={3}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Quer comentar mais alguma coisa? (opcional)"
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm resize-none mb-1.5"
        />
        <p className="text-xs text-p-neutral mb-5">
          Sua resposta é 100% anônima — não fica vinculada ao seu usuário.
        </p>

        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleSkip}
            className="flex-1 border border-slate-300 text-p-primary-dark py-2.5 rounded-lg text-sm font-medium"
          >
            Agora não
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={score === null || submitting}
            className="flex-1 bg-p-primary text-white py-2.5 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? 'Enviando...' : 'Enviar'}
          </button>
        </div>
      </div>
    </div>
  );
}
