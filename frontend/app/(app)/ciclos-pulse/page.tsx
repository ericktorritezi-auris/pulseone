'use client';

import { useEffect, useState, FormEvent } from 'react';
import { Plus, BarChart3 } from 'lucide-react';
import { api } from '../../../lib/api';
import { PulseCycle, CycleProgress } from '../../../lib/types';
import { Drawer } from '../../../components/shared/Drawer';
import { StatusBadge } from '../../../components/shared/StatusBadge';
import { ProgressBar } from '../../../components/shared/ProgressBar';

const ACTIONS: Record<string, { label: string; action: string; next: string }[]> = {
  RASCUNHO: [{ label: 'Abrir Ciclo', action: 'open', next: 'ABERTO' }],
  ABERTO: [{ label: 'Encerrar Ciclo', action: 'close', next: 'ENCERRADO' }],
  ENCERRADO: [{ label: 'Consolidar', action: 'consolidate', next: 'EM_CONSOLIDACAO' }],
  EM_CONSOLIDACAO: [],
  FINALIZADO: [{ label: 'Arquivar', action: 'archive', next: 'ARQUIVADO' }],
  ARQUIVADO: [],
};

// Progresso só faz sentido consultar depois que o ciclo já gerou avaliações.
const SHOWS_PROGRESS = new Set(['ABERTO', 'ENCERRADO', 'EM_CONSOLIDACAO', 'FINALIZADO', 'ARQUIVADO']);

export default function CiclosPulsePage() {
  const [cycles, setCycles] = useState<PulseCycle[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [deadline, setDeadline] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);

  const [progressDrawerOpen, setProgressDrawerOpen] = useState(false);
  const [progressCycleLabel, setProgressCycleLabel] = useState('');
  const [progress, setProgress] = useState<CycleProgress | null>(null);
  const [progressLoading, setProgressLoading] = useState(false);

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

  async function handleViewProgress(cycle: PulseCycle) {
    setProgressCycleLabel(cycle.label);
    setProgressDrawerOpen(true);
    setProgressLoading(true);
    try {
      setProgress(await api.get<CycleProgress>(`/pulse-cycles/${cycle.id}/progress`));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao carregar progresso.');
    } finally {
      setProgressLoading(false);
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
                    {SHOWS_PROGRESS.has(cycle.status) && (
                      <button
                        onClick={() => handleViewProgress(cycle)}
                        className="flex items-center gap-1.5 text-xs font-medium text-p-neutral border border-slate-200 px-3 py-1.5 rounded-lg hover:border-p-primary hover:text-p-primary"
                      >
                        <BarChart3 size={14} />
                        Ver Progresso
                      </button>
                    )}
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

      <Drawer
        open={progressDrawerOpen}
        onClose={() => setProgressDrawerOpen(false)}
        title={`Progresso — ${progressCycleLabel}`}
      >
        {progressLoading && <p className="text-sm text-p-neutral">Carregando...</p>}

        {!progressLoading && progress && (
          <div className="space-y-5">
            <div className="bg-p-primary/5 rounded-xl p-4">
              <p className="text-xs text-p-neutral mb-1">Progresso geral da organização</p>
              <ProgressBar value={progress.percentualGeral} />
            </div>

            <div>
              <p className="text-xs font-semibold text-p-neutral uppercase mb-3">Por área</p>
              <div className="space-y-4">
                {progress.areas.length === 0 && (
                  <p className="text-sm text-p-neutral">Nenhuma avaliação gerada para este ciclo.</p>
                )}
                {progress.areas.map((area) => (
                  <div key={area.areaId}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-medium text-p-primary-dark">{area.areaName}</span>
                      <span className="text-p-neutral">
                        {area.finalizados}/{area.total}
                      </span>
                    </div>
                    <ProgressBar value={area.percentual} showLabel={false} />
                  </div>
                ))}
              </div>
            </div>

            <p className="text-xs text-p-neutral">
              Isso é só informativo — você pode encerrar o ciclo a qualquer momento, mesmo sem 100% em
              todas as áreas.
            </p>
          </div>
        )}
      </Drawer>
    </div>
  );
}
