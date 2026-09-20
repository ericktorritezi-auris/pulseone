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

export default function RelatoriosPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<ReportListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [generatingOnePage, setGeneratingOnePage] = useState(false);
  const [onePageError, setOnePageError] = useState('');

  // v1.8.0 — One Page Executiva (seção 5.60): resumo de uma página com
  // todas as áreas geridas, pronto pra apresentar à Diretoria.
  async function handleGenerateOnePage() {
    setGeneratingOnePage(true);
    setOnePageError('');
    try {
      const blob = await api.getBlob('/pulse-reports/one-page/pdf');
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (err) {
      setOnePageError(err instanceof Error ? err.message : 'Erro ao gerar a One Page Executiva.');
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
            onClick={handleGenerateOnePage}
            disabled={generatingOnePage}
            className="flex items-center gap-2 bg-p-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-60 shrink-0"
          >
            <FileBarChart size={16} />
            {generatingOnePage ? 'Gerando...' : 'Gerar One Page Executiva'}
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
    </div>
  );
}
