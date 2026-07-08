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

  const [masterModalOpen, setMasterModalOpen] = useState(false);
  const [masterPasswordInput, setMasterPasswordInput] = useState('');
  const [masterError, setMasterError] = useState('');

  if (user?.role !== 'ADMIN') {
    return <p className="text-sm text-p-neutral">Esta página é exclusiva do administrador.</p>;
  }

  const canConfirm = typedPhrase === REQUIRED_PHRASE;

  function openMasterModal() {
    if (!canConfirm) return;
    setMasterPasswordInput('');
    setMasterError('');
    setMasterModalOpen(true);
  }

  async function handleConfirmReset() {
    if (!masterPasswordInput.trim()) return;

    setSubmitting(true);
    setError('');
    setMasterError('');
    setResult(null);
    try {
      const res = await api.post<{ mensagem: string }>('/admin-tools/reset-test-data', {
        confirmationPhrase: typedPhrase,
        masterPassword: masterPasswordInput,
      });
      setResult(res.mensagem);
      setTypedPhrase('');
      setMasterModalOpen(false);
      setMasterPasswordInput('');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao resetar.';
      // Mantém o modal aberto e mostra o erro ali — dupla trava (frase +
      // senha MASTER) exige tentar de novo se qualquer uma estiver errada.
      setMasterError(message);
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
          onClick={openMasterModal}
          disabled={!canConfirm}
          className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Apagar todos os dados de teste
        </button>
      </div>

      {masterModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle size={18} className="text-red-600" />
              <h3 className="text-base font-semibold text-red-600">Confirmação final</h3>
            </div>
            <p className="text-sm text-p-neutral mb-4">
              Essa ação é <b>permanente e não pode ser desfeita</b>. Pra executar o reset, digite a
              senha MASTER do sistema.
            </p>
            <input
              type="password"
              autoFocus
              value={masterPasswordInput}
              onChange={(e) => setMasterPasswordInput(e.target.value)}
              placeholder="Senha MASTER"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm mb-2"
            />
            {masterError && <p className="text-sm text-red-600 mb-2">{masterError}</p>}
            <div className="flex gap-3 mt-3">
              <button
                onClick={() => setMasterModalOpen(false)}
                className="flex-1 border border-slate-300 text-p-primary-dark py-2.5 rounded-lg text-sm font-medium"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmReset}
                disabled={submitting || !masterPasswordInput.trim()}
                className="flex-1 bg-red-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50"
              >
                {submitting ? 'Apagando...' : 'Confirmar e apagar tudo'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
