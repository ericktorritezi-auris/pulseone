'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { api } from '../../../lib/api';
import { useAuth } from '../../../lib/auth-context';
import { ReportListItem } from '../../../lib/types';
import { AvatarInitials } from '../../../components/shared/AvatarInitials';
import { StatusBadge } from '../../../components/shared/StatusBadge';

export default function RelatoriosPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<ReportListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const endpoint = user?.role === 'ADMIN' ? '/pulse-reports/all' : '/pulse-reports';
    api
      .get<ReportListItem[]>(endpoint)
      .then(setItems)
      .finally(() => setLoading(false));
  }, [user?.role]);

  if (loading) return <p className="text-sm text-p-neutral">Carregando...</p>;

  return (
    <div>
      <h1 className="text-xl font-semibold text-p-primary-dark mb-1">Relatórios</h1>
      <p className="text-sm text-p-neutral mb-6">
        {user?.role === 'ADMIN'
          ? 'Todos os relatórios de todos os ciclos.'
          : 'Relatórios dos seus liderados diretos, por ciclo.'}
      </p>

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
