'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Folder, Lock } from 'lucide-react';
import { api } from '../../../lib/api';
import { PendingPulseFeedback } from '../../../lib/types';
import { ProgressBar } from '../../../components/shared/ProgressBar';
import { PulseItemsByType } from '../../../components/shared/PulseItemsByType';

export default function PulsePage() {
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

  // Agrupa por ciclo primeiro. O ciclo ABERTO fica solto na tela (é o que
  // importa agora); qualquer outro (ENCERRADO em diante) vira uma "pastinha"
  // clicável — assim a tela não acumula um tabelão de ciclos antigos.
  const byCycle = new Map<string, PendingPulseFeedback[]>();
  for (const item of items) {
    const group = byCycle.get(item.cycleId) ?? [];
    group.push(item);
    byCycle.set(item.cycleId, group);
  }

  let currentCycleItems: PendingPulseFeedback[] | null = null;
  const pastCycles: { cycleId: string; label: string; count: number }[] = [];

  for (const [cycleId, groupItems] of byCycle.entries()) {
    if (groupItems[0].cycle.status === 'ABERTO') {
      currentCycleItems = groupItems;
    } else {
      pastCycles.push({ cycleId, label: groupItems[0].cycle.label, count: groupItems.length });
    }
  }

  const total = currentCycleItems?.length ?? 0;
  const finishedCount = currentCycleItems?.filter((i) => i.status === 'FINALIZADO').length ?? 0;
  const progress = total > 0 ? (finishedCount / total) * 100 : 0;

  return (
    <div className="max-w-2xl">
      {currentCycleItems ? (
        <>
          <h1 className="text-xl font-semibold text-p-primary-dark mb-1">
            {currentCycleItems[0].cycle.label}
          </h1>
          <p className="text-sm text-p-neutral mb-4">
            Suas avaliações deste ciclo. Enquanto ele estiver aberto, você pode reabrir e editar
            qualquer uma delas.
          </p>

          <div className="mb-8">
            <PulseItemsByType items={currentCycleItems} />
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-xs text-p-neutral mb-2">Progresso geral</p>
            <ProgressBar value={progress} />
            <p className="text-xs text-p-neutral mt-1">
              {finishedCount} de {total} avaliações concluídas
            </p>
          </div>
        </>
      ) : (
        <div className="mb-8">
          <h1 className="text-xl font-semibold text-p-primary-dark mb-1">Feedback Pulse</h1>
          <p className="text-sm text-p-neutral">Nenhum ciclo aberto no momento.</p>
        </div>
      )}

      {pastCycles.length > 0 && (
        <div className={currentCycleItems ? 'mt-8' : ''}>
          <p className="text-xs font-semibold text-p-neutral uppercase mb-3">Ciclos anteriores</p>
          <div className="space-y-2">
            {pastCycles.map((c) => (
              <Link
                key={c.cycleId}
                href={`/pulse/ciclo/${c.cycleId}`}
                className="flex items-center gap-3 bg-white rounded-xl border border-slate-200 p-4 hover:border-p-primary transition-colors"
              >
                <div className="w-9 h-9 rounded-lg bg-slate-100 text-p-neutral flex items-center justify-center">
                  <Folder size={16} />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-p-primary-dark">{c.label}</p>
                  <p className="text-xs text-p-neutral">{c.count} avaliações</p>
                </div>
                <Lock size={14} className="text-p-neutral" />
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
