'use client';

import { useEffect, useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../../../../lib/api';

interface Recipient {
  id: string;
  fullName: string;
  area: { name: string };
}

export default function NovoFeedbackPage() {
  const router = useRouter();
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [receiverId, setReceiverId] = useState('');
  const [text, setText] = useState('');
  const [npsScore, setNpsScore] = useState(8);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    api.get<Recipient[]>('/feedbacks/recipients').then(setRecipients).catch(() => {});
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await api.post('/feedbacks', { receiverId, text, npsScore });
      setSuccess(true);
      setTimeout(() => router.push('/feedbacks/enviados'), 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao enviar feedback.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-lg">
      <h1 className="text-xl font-semibold text-p-primary-dark mb-1">Enviar Feedback</h1>
      <p className="text-sm text-p-neutral mb-6">
        Feedback contínuo pode ser enviado a qualquer momento, para qualquer pessoa da organização.
      </p>

      {success ? (
        <div className="bg-white rounded-xl border border-slate-200 p-6 text-center">
          <p className="text-p-success font-medium">Feedback enviado com sucesso!</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-p-primary-dark mb-1">Destinatário</label>
            <select
              required
              value={receiverId}
              onChange={(e) => setReceiverId(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            >
              <option value="">Selecione...</option>
              {recipients.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.fullName} — {r.area.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-p-primary-dark mb-1">Feedback</label>
            <textarea
              required
              minLength={1}
              rows={5}
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm resize-none"
              placeholder="Escreva um feedback construtivo e específico..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-p-primary-dark mb-2">
              De 0 a 10, o quanto você recomendaria esta pessoa para trabalhar em outro projeto ou equipe?
            </label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={10}
                value={npsScore}
                onChange={(e) => setNpsScore(Number(e.target.value))}
                className="flex-1"
              />
              <span className="w-8 text-center font-semibold text-p-primary-dark">{npsScore}</span>
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-p-primary text-white py-2.5 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-60"
          >
            {submitting ? 'Enviando...' : 'Enviar Feedback'}
          </button>
        </form>
      )}
    </div>
  );
}
