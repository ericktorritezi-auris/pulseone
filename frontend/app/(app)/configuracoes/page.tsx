'use client';

import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { api } from '../../../lib/api';
import { useAuth } from '../../../lib/auth-context';

const REQUIRED_PHRASE = 'CONFIRMO-APAGAR-TODOS-OS-DADOS-DE-TESTE';

export default function ConfiguracoesPage() {
  const { user } = useAuth();
  const [typedPhrase, setTypedPhrase] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState('');

  if (user?.role !== 'ADMIN') {
    return <p className="text-sm text-p-neutral">Esta página é exclusiva do administrador.</p>;
  }

  const canConfirm = typedPhrase === REQUIRED_PHRASE;

  async function handleReset() {
    if (!canConfirm) return;
    if (
      !confirm(
        'Isso vai apagar PERMANENTEMENTE todos os dados de teste (pessoas, áreas, cargos, ciclos, feedbacks, relatórios) — restando só o(s) admin(s). Não tem como desfazer. Confirma mesmo?',
      )
    ) {
      return;
    }

    setSubmitting(true);
    setError('');
    setResult(null);
    try {
      const res = await api.post<{ mensagem: string }>('/admin-tools/reset-test-data', {
        confirmationPhrase: typedPhrase,
      });
      setResult(res.mensagem);
      setTypedPhrase('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao resetar.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-semibold text-p-primary-dark mb-6">Configurações</h1>

      <div className="bg-white rounded-xl border-2 border-red-200 p-6">
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle size={18} className="text-red-600" />
          <h2 className="text-sm font-semibold text-red-600">Zona de Perigo</h2>
        </div>
        <p className="text-sm text-p-neutral mb-4">
          Apaga permanentemente todos os dados de teste — pessoas, áreas, cargos, ciclos Pulse,
          feedbacks, relatórios e notificações. Restam apenas o(s) cadastro(s) de administrador
          (sem área/cargo, como já é o caso) e as 5 perguntas oficiais do sistema. Use isso só
          quando estiver pronto pra começar a usar o PulseOne de verdade, com dados reais.
        </p>

        <label className="block text-sm font-medium text-p-primary-dark mb-1">
          Digite exatamente <code className="bg-slate-100 px-1 rounded">{REQUIRED_PHRASE}</code> pra
          habilitar o botão:
        </label>
        <input
          value={typedPhrase}
          onChange={(e) => setTypedPhrase(e.target.value)}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm mb-4"
          placeholder={REQUIRED_PHRASE}
        />

        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
        {result && <p className="text-sm text-p-success mb-3">{result}</p>}

        <button
          onClick={handleReset}
          disabled={!canConfirm || submitting}
          className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {submitting ? 'Apagando...' : 'Apagar todos os dados de teste'}
        </button>
      </div>
    </div>
  );
}
