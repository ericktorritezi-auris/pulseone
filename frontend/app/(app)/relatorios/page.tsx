'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRight, FileBarChart } from 'lucide-react';
import { api } from '../../../lib/api';
import { useAuth } from '../../../lib/auth-context';
import { ReportListItem } from '../../../lib/types';
import { AvatarInitials } from '../../../components/shared/AvatarInitials';
import { StatusBadge } from '../../../components/shared/StatusBadge';
import { ProgressBar } from '../../../components/shared/ProgressBar';

interface OnePageCycleOption {
  id: string;
  label: string;
  openedAt: string | null;
}

export default function RelatoriosPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<ReportListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [generatingOnePage, setGeneratingOnePage] = useState(false);
  const [onePageError, setOnePageError] = useState('');

  // v1.8.3 — pedido do Erick: antes o Relatório Executivo sempre pegava o
  // último ciclo fechado por trás dos panos, sem avisar nem deixar
  // escolher. Agora, ao clicar no botão, abre esse seletor com os ciclos
  // fechados disponíveis.
  //
  // v1.8.5 — pedido do Erick (voz, 20/09): quando o Pulse é aberto
  // SEPARADO por área (um ciclo por área, em vez de um ciclo único pra
  // todas), escolher um ciclo só não dava "o valor real de todas" — cada
  // área ficava de fora se não fosse a dona do ciclo escolhido. Virou
  // seleção MÚLTIPLA (checkboxes); nada vem pré-marcado por padrão — o
  // gestor escolhe manualmente quais ciclos entram (confirmado com o
  // Erick).
  const [showCycleModal, setShowCycleModal] = useState(false);
  const [cycleOptions, setCycleOptions] = useState<OnePageCycleOption[]>([]);
  const [loadingCycles, setLoadingCycles] = useState(false);
  const [selectedCycleIds, setSelectedCycleIds] = useState<string[]>([]);

  async function openCycleModal() {
    setOnePageError('');
    setShowCycleModal(true);
    setLoadingCycles(true);
    try {
      const cycles = await api.get<OnePageCycleOption[]>('/pulse-reports/one-page/cycles');
      setCycleOptions(cycles);
      setSelectedCycleIds([]);
    } catch (err) {
      setOnePageError(err instanceof Error ? err.message : 'Erro ao buscar os ciclos disponíveis.');
      setShowCycleModal(false);
    } finally {
      setLoadingCycles(false);
    }
  }

  function toggleCycle(id: string) {
    setSelectedCycleIds((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));
  }

  async function handleGenerateOnePage() {
    if (selectedCycleIds.length === 0) return;
    setGeneratingOnePage(true);
    setOnePageError('');
    try {
      const blob = await api.getBlob(`/pulse-reports/one-page/pdf?cycleIds=${selectedCycleIds.join(',')}`);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
      setShowCycleModal(false);
    } catch (err) {
      setOnePageError(err instanceof Error ? err.message : 'Erro ao gerar o Relatório Executivo.');
    } finally {
      setGeneratingOnePage(false);
    }
  }

  useEffect(() => {
    const endpoint = user?.role === 'ADMIN' ? '/pulse-reports/all' : '/pulse-reports';
    api
      .get<ReportListItem[]>(endpoint)
      .then(setItems)
      .finally(() => setLoading(false));
  }, [user?.role]);

  if (loading) return <p className="text-sm text-p-neutral">Carregando...</p>;

  const finalizados = items.filter((i) => i.status === 'FINALIZADO').length;
  const progress = items.length > 0 ? (finalizados / items.length) * 100 : 0;

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-1">
        <h1 className="text-xl font-semibold text-p-primary-dark">Relatórios</h1>
        {user?.role === 'GESTOR' && (
          <button
            onClick={openCycleModal}
            className="flex items-center gap-2 bg-p-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-60 shrink-0"
          >
            <FileBarChart size={16} />
            Gerar Relatório Executivo
          </button>
        )}
      </div>
      {onePageError && <p className="text-sm text-red-600 mb-2">{onePageError}</p>}
      <p className="text-sm text-p-neutral mb-6">
        {user?.role === 'ADMIN'
          ? 'Todos os relatórios de todos os ciclos.'
          : 'Relatórios dos seus liderados diretos, por ciclo.'}
      </p>

      {user?.role === 'GESTOR' && items.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 mb-6">
          <p className="text-xs text-p-neutral mb-2">
            Seu progresso de consolidação — {finalizados} de {items.length} finalizados
          </p>
          <ProgressBar value={progress} showLabel={false} />
          <p className="text-xs text-p-neutral mt-2">
            Os resultados só ficam visíveis pra sua equipe quando toda a área estiver 100% finalizada.
          </p>
        </div>
      )}

      {items.length === 0 ? (
        <p className="text-sm text-p-neutral">Nenhum relatório disponível ainda.</p>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          {items.map((item) => (
            <button
              key={item.id}
              onClick={() => router.push(`/relatorios/${item.id}`)}
              className="w-full flex items-center gap-3 p-4 border-b border-slate-100 last:border-0 hover:bg-slate-50 text-left"
            >
              {item.owner && <AvatarInitials name={item.owner.fullName} size="sm" />}
              <div className="flex-1">
                <p className="text-sm font-medium text-p-primary-dark">{item.owner?.fullName}</p>
                <p className="text-xs text-p-neutral">{item.cycle.label}</p>
              </div>
              <StatusBadge status={item.status} />
              <ChevronRight size={16} className="text-p-neutral" />
            </button>
          ))}
        </div>
      )}

      {showCycleModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-p-primary-dark/50 px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-7">
            <h2 className="text-base font-bold text-p-primary-dark mb-1">Quais ciclos Pulse?</h2>
            <p className="text-sm text-p-neutral mb-5">
              Marque um ou mais ciclos fechados. Se você abriu o Pulse separado por área, marque todos pra ter o
              valor real de cada uma no mesmo relatório.
            </p>

            {loadingCycles ? (
              <p className="text-sm text-p-neutral mb-5">Carregando ciclos disponíveis...</p>
            ) : cycleOptions.length === 0 ? (
              <p className="text-sm text-p-neutral mb-5">
                Nenhuma das suas áreas geridas tem um ciclo finalizado ou arquivado ainda.
              </p>
            ) : (
              <div className="flex flex-col gap-2 mb-5 max-h-64 overflow-y-auto">
                {cycleOptions.map((cycle, idx) => {
                  const checked = selectedCycleIds.includes(cycle.id);
                  return (
                    <button
                      key={cycle.id}
                      type="button"
                      onClick={() => toggleCycle(cycle.id)}
                      className={`flex items-center gap-3 text-left px-3 py-2.5 rounded-lg border text-sm transition-colors ${
                        checked
                          ? 'bg-p-primary/10 border-p-primary text-p-primary-dark font-medium'
                          : 'border-slate-200 hover:border-p-primary text-p-primary-dark'
                      }`}
                    >
                      <span
                        className={`flex items-center justify-center w-4 h-4 rounded border shrink-0 ${
                          checked ? 'bg-p-primary border-p-primary text-white' : 'border-slate-300'
                        }`}
                      >
                        {checked && (
                          <svg viewBox="0 0 16 16" width="10" height="10" fill="none">
                            <path d="M3 8.5L6.5 12L13 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </span>
                      <span className="flex-1">{cycle.label}</span>
                      {idx === 0 && <span className="text-[10px] font-semibold text-p-primary uppercase shrink-0">Mais recente</span>}
                    </button>
                  );
                })}
              </div>
            )}

            {onePageError && <p className="text-sm text-red-600 mb-3">{onePageError}</p>}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowCycleModal(false)}
                className="flex-1 border border-slate-300 text-p-primary-dark py-2.5 rounded-lg text-sm font-medium"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleGenerateOnePage}
                disabled={selectedCycleIds.length === 0 || generatingOnePage || loadingCycles}
                className="flex-1 bg-p-primary text-white py-2.5 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50"
              >
                {generatingOnePage ? 'Gerando...' : `Gerar PDF${selectedCycleIds.length > 0 ? ` (${selectedCycleIds.length})` : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
