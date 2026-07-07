'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRight, Lock } from 'lucide-react';
import { api } from '../../../lib/api';
import { ReportListItem } from '../../../lib/types';
import { StatusBadge } from '../../../components/shared/StatusBadge';

export default function HistoricoPage() {
  const router = useRouter();
  const [items, setItems] = useState<ReportListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<ReportListItem[]>('/pulse-reports/mine')
      .then(setItems)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-sm text-p-neutral">Carregando...</p>;

  return (
    <div>
      <h1 className="text-xl font-semibold text-p-primary-dark mb-1">Meu Histórico</h1>
      <p className="text-sm text-p-neutral mb-6">
        Seus relatórios de cada ciclo. Só é possível ver o resultado completo depois que o gestor
        finaliza o parecer.
      </p>

      {items.length === 0 ? (
        <p className="text-sm text-p-neutral">Nenhum ciclo com relatório ainda.</p>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          {items.map((item) => {
            const isFinalized = item.status === 'FINALIZADO';
            return (
              <button
                key={item.id}
                onClick={() => isFinalized && router.push(`/relatorios/${item.id}`)}
                disabled={!isFinalized}
                className={`w-full flex items-center gap-3 p-4 border-b border-slate-100 last:border-0 text-left ${
                  isFinalized ? 'hover:bg-slate-50' : 'opacity-60 cursor-not-allowed'
                }`}
              >
                <div className="flex-1">
                  <p className="text-sm font-medium text-p-primary-dark">{item.cycle.label}</p>
                  {!isFinalized && (
                    <p className="text-xs text-p-neutral">Aguardando o gestor finalizar o parecer</p>
                  )}
                </div>
                <StatusBadge status={item.status} />
                {isFinalized ? (
                  <ChevronRight size={16} className="text-p-neutral" />
                ) : (
                  <Lock size={14} className="text-p-neutral" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
