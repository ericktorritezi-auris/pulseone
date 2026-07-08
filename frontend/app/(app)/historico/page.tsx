'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRight, Lock } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { api } from '../../../lib/api';
import { ReportListItem, CollaboratorDashboard } from '../../../lib/types';
import { StatusBadge } from '../../../components/shared/StatusBadge';

export default function HistoricoPage() {
  const router = useRouter();
  const [items, setItems] = useState<ReportListItem[]>([]);
  const [evolution, setEvolution] = useState<{ ciclo: string; score: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get<ReportListItem[]>('/pulse-reports/mine').then(setItems),
      api.get<CollaboratorDashboard>('/dashboard/collaborator').then((d) => setEvolution(d.scoreEvolution)),
    ]).finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-sm text-p-neutral">Carregando...</p>;

  return (
    <div>
      <h1 className="text-xl font-semibold text-p-primary-dark mb-1">Meu Histórico</h1>
      <p className="text-sm text-p-neutral mb-6">
        Seus relatórios de cada ciclo. Só é possível ver o resultado completo depois que o gestor
        finaliza o parecer.
      </p>

      {evolution.length > 1 && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 mb-6">
          <p className="text-xs font-semibold text-p-neutral uppercase mb-3">Evolução do Score</p>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={evolution}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
              <XAxis dataKey="ciclo" tick={{ fontSize: 11, fill: '#64748B' }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#64748B' }} />
              <Tooltip />
              <Line type="monotone" dataKey="score" stroke="#2563EB" strokeWidth={2} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

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
