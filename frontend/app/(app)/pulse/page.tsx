'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ClipboardCheck, ChevronRight, Lock, User, Users } from 'lucide-react';
import { api } from '../../../lib/api';
import { PendingPulseFeedback } from '../../../lib/types';
import { ProgressBar } from '../../../components/shared/ProgressBar';
import { AvatarInitials } from '../../../components/shared/AvatarInitials';
import { StatusBadge } from '../../../components/shared/StatusBadge';

const TYPE_LABELS: Record<string, { title: string; icon: typeof User }> = {
  AUTOAVALIACAO: { title: 'Minha Autoavaliação', icon: User },
  GESTOR: { title: 'Avaliação do Gestor', icon: ClipboardCheck },
  COLEGA: { title: 'Avaliação dos Colegas', icon: Users },
};

export default function PulsePage() {
  const router = useRouter();
  const [items, setItems] = useState<PendingPulseFeedback[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<PendingPulseFeedback[]>('/pulse-feedbacks/mine')
      .then(setItems)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <p className="text-sm text-p-neutral">Carregando...</p>;
  }

  if (items.length === 0) {
    return (
      <div>
        <h1 className="text-xl font-semibold text-p-primary-dark mb-1">Feedback Pulse</h1>
        <p className="text-sm text-p-neutral">Nenhum ciclo Pulse aberto no momento.</p>
      </div>
    );
  }

  const total = items.length;
  const finishedCount = items.filter((i) => i.status === 'FINALIZADO').length;
  const progress = (finishedCount / total) * 100;
  const cycleLabel = items[0]?.cycle.label;
  const cycleOpen = items[0]?.editable ?? items[0]?.cycle.status === 'ABERTO';

  const grouped = items.reduce<Record<string, PendingPulseFeedback[]>>((acc, item) => {
    (acc[item.type] ??= []).push(item);
    return acc;
  }, {});

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-xl font-semibold text-p-primary-dark">{cycleLabel ?? 'Feedback Pulse'}</h1>
        {!cycleOpen && (
          <span className="flex items-center gap-1 text-xs text-p-neutral">
            <Lock size={12} /> Ciclo encerrado — somente leitura
          </span>
        )}
      </div>
      <p className="text-sm text-p-neutral mb-4">
        {cycleOpen
          ? 'Suas avaliações. Enquanto o ciclo estiver aberto, você pode reabrir e editar qualquer uma delas.'
          : 'Suas avaliações deste ciclo. O ciclo foi encerrado, então elas ficam disponíveis apenas para consulta.'}
      </p>

      <div className="space-y-6 mb-8">
        {Object.entries(grouped).map(([type, groupItems]) => {
          const info = TYPE_LABELS[type];
          const Icon = info.icon;

          return (
            <div key={type}>
              <div className="flex items-center gap-2 mb-2">
                <Icon size={16} className="text-p-primary" />
                <p className="text-sm font-semibold text-p-primary-dark">{info.title}</p>
              </div>
              <div className="space-y-2">
                {groupItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => router.push(`/pulse/${item.id}`)}
                    className="w-full flex items-center gap-3 bg-white rounded-xl border border-slate-200 p-3 hover:border-p-primary transition-colors text-left"
                  >
                    <AvatarInitials name={item.target.fullName} size="sm" />
                    <span className="flex-1 text-sm font-medium text-p-primary-dark">
                      {item.target.fullName}
                    </span>
                    <StatusBadge status={item.status} />
                    <ChevronRight size={16} className="text-p-neutral" />
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <p className="text-xs text-p-neutral mb-2">Progresso geral</p>
        <ProgressBar value={progress} />
        <p className="text-xs text-p-neutral mt-1">
          {finishedCount} de {total} avaliações concluídas
        </p>
      </div>
    </div>
  );
}
