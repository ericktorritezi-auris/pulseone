'use client';

import { useEffect, useState, FormEvent } from 'react';
import { Plus } from 'lucide-react';
import { api } from '../../../lib/api';
import { PulseCycle } from '../../../lib/types';
import { Drawer } from '../../../components/shared/Drawer';
import { StatusBadge } from '../../../components/shared/StatusBadge';

const ACTIONS: Record<string, { label: string; action: string; next: string }[]> = {
  RASCUNHO: [{ label: 'Abrir Ciclo', action: 'open', next: 'ABERTO' }],
  ABERTO: [{ label: 'Encerrar Ciclo', action: 'close', next: 'ENCERRADO' }],
  ENCERRADO: [{ label: 'Consolidar', action: 'consolidate', next: 'EM_CONSOLIDACAO' }],
  EM_CONSOLIDACAO: [],
  FINALIZADO: [{ label: 'Arquivar', action: 'archive', next: 'ARQUIVADO' }],
  ARQUIVADO: [],
};

export default function CiclosPulsePage() {
  const [cycles, setCycles] = useState<PulseCycle[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [deadline, setDeadline] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);

  async function loadData() {
    setLoading(true);
    try {
      setCycles(await api.get<PulseCycle[]>('/pulse-cycles'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar ciclos.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await api.post('/pulse-cycles', { label });
      setDrawerOpen(false);
      setLabel('');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar ciclo.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAction(cycleId: string, action: string) {
    setActingId(cycleId);
    try {
      const body = action === 'open' && deadline ? { deadline } : undefined;
      await api.patch(`/pulse-cycles/${cycleId}/${action}`, body);
      await loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao executar ação.');
    } finally {
      setActingId(null);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-p-primary-dark">Ciclos Pulse</h1>
          <p className="text-sm text-p-neutral">
            Ao abrir um ciclo, as avaliações são geradas automaticamente por área.
          </p>
        </div>
        <button
          onClick={() => setDrawerOpen(true)}
          className="flex items-center gap-2 bg-p-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90"
        >
          <Plus size={16} />
          Novo Ciclo
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-p-neutral text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-3">Ciclo</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-left px-4 py-3">Prazo</th>
              <th className="text-right px-4 py-3">Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={4} className="text-center py-8 text-p-neutral">Carregando...</td>
              </tr>
            )}
            {!loading && cycles.length === 0 && (
              <tr>
                <td colSpan={4} className="text-center py-8 text-p-neutral">Nenhum ciclo criado ainda.</td>
              </tr>
            )}
            {cycles.map((cycle) => (
              <tr key={cycle.id} className="border-t border-slate-100">
                <td className="px-4 py-3 font-medium text-p-primary-dark">{cycle.label}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={cycle.status} />
                </td>
                <td className="px-4 py-3 text-p-neutral">
                  {cycle.deadline ? new Date(cycle.deadline).toLocaleDateString('pt-BR') : '—'}
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    {ACTIONS[cycle.status]?.map((a) => (
                      <button
                        key={a.action}
                        onClick={() => handleAction(cycle.id, a.action)}
                        disabled={actingId === cycle.id}
                        className="text-xs font-medium bg-p-primary/10 text-p-primary px-3 py-1.5 rounded-lg hover:bg-p-primary/20 disabled:opacity-50"
                      >
                        {actingId === cycle.id ? 'Processando...' : a.label}
                      </button>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title="Novo Ciclo Pulse">
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-p-primary-dark mb-1">Nome do Ciclo</label>
            <input
              required
              minLength={3}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              placeholder="Ex: Pulse Julho/2026"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-p-primary-dark mb-1">
              Prazo (opcional — definido ao abrir o ciclo)
            </label>
            <input
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              className="flex-1 border border-slate-300 text-p-primary-dark py-2.5 rounded-lg text-sm font-medium"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 bg-p-primary text-white py-2.5 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-60"
            >
              {submitting ? 'Criando...' : 'Criar Ciclo'}
            </button>
          </div>
        </form>
      </Drawer>
    </div>
  );
}
