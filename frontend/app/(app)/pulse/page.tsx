'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ClipboardCheck, User, Users } from 'lucide-react';
import { api } from '../../../lib/api';
import { PendingPulseFeedback } from '../../../lib/types';
import { ProgressBar } from '../../../components/shared/ProgressBar';

const TYPE_LABELS: Record<string, { title: string; subtitle: string; icon: typeof User }> = {
  AUTOAVALIACAO: { title: 'Minha Autoavaliação', subtitle: 'Avalie a si mesmo', icon: User },
  GESTOR: { title: 'Avaliação do Gestor', subtitle: 'Avalie seu gestor', icon: ClipboardCheck },
  COLEGA: { title: 'Avaliação dos Colegas', subtitle: 'Avalie seus colegas de equipe', icon: Users },
};

export default function PulsePage() {
  const [pending, setPending] = useState<PendingPulseFeedback[]>([]);
  const [finishedCount, setFinishedCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get<PendingPulseFeedback[]>('/pulse-feedbacks/pending'),
      api.get<PendingPulseFeedback[]>('/pulse-feedbacks/finished'),
    ])
      .then(([pendingRes, finishedRes]) => {
        setPending(pendingRes);
        setFinishedCount(finishedRes.length);
      })
      .finally(() => setLoading(false));
  }, []);

  const total = pending.length + finishedCount;
  const progress = total > 0 ? (finishedCount / total) * 100 : 0;
  const cycleLabel = pending[0]?.cycle.label;

  // Agrupa por tipo pra exibir um card por categoria (Autoavaliação / Gestor / Colegas)
  const grouped = pending.reduce<Record<string, PendingPulseFeedback[]>>((acc, item) => {
    (acc[item.type] ??= []).push(item);
    return acc;
  }, {});

  if (loading) {
    return <p className="text-sm text-p-neutral">Carregando...</p>;
  }

  if (total === 0) {
    return (
      <div>
        <h1 className="text-xl font-semibold text-p-primary-dark mb-1">Feedback Pulse</h1>
        <p className="text-sm text-p-neutral">Nenhum ciclo Pulse aberto no momento.</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-xl font-semibold text-p-primary-dark">{cycleLabel ?? 'Feedback Pulse'}</h1>
      </div>
      <p className="text-sm text-p-neutral mb-4">Selecione o tipo de avaliação que deseja realizar:</p>

      <div className="space-y-3 mb-8">
        {Object.entries(grouped).map(([type, items]) => {
          const info = TYPE_LABELS[type];
          const Icon = info.icon;
          const href = items.length === 1 ? `/pulse/${items[0].id}` : `/pulse/lista/${type}`;

          return (
            <Link
              key={type}
              href={href}
              className="flex items-center gap-4 bg-white rounded-xl border border-slate-200 p-4 hover:border-p-primary transition-colors"
            >
              <div className="w-10 h-10 rounded-lg bg-p-primary/10 text-p-primary flex items-center justify-center">
                <Icon size={20} />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-p-primary-dark">{info.title}</p>
                <p className="text-xs text-p-neutral">
                  {info.subtitle}
                  {items.length > 1 && ` — ${items.length} pendentes`}
                </p>
              </div>
            </Link>
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
