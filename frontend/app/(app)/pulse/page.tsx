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

  // Agrupa por ciclo primeiro. Cada ciclo ABERTO vira sua própria seção
  // na tela (pode ter mais de um ao mesmo tempo — um por área, desde que
  // ciclos por área foram implementados); qualquer outro (ENCERRADO em
  // diante) vira uma "pastinha" clicável — assim a tela não acumula um
  // tabelão de ciclos antigos.
  //
  // CORREÇÃO (pedido urgente do Erick): antes, essa lógica sobrescrevia
  // uma única variável "ciclo atual" a cada ciclo aberto encontrado — com
  // só 1 ciclo aberto no sistema todo (como era antes de existir ciclo
  // por área), isso nunca dava problema. Com vários ciclos abertos ao
  // mesmo tempo, só o último sobrevivia e os outros desapareciam da tela
  // sem aviso nenhum — apesar do backend sempre ter retornado tudo certo.
  const byCycle = new Map<string, PendingPulseFeedback[]>();
  for (const item of items) {
    const group = byCycle.get(item.cycleId) ?? [];
    group.push(item);
    byCycle.set(item.cycleId, group);
  }

  const openCycleGroups: { cycleId: string; label: string; items: PendingPulseFeedback[] }[] = [];
  const pastCycles: { cycleId: string; label: string; count: number }[] = [];

  for (const [cycleId, groupItems] of byCycle.entries()) {
    if (groupItems[0].cycle.status === 'ABERTO') {
      openCycleGroups.push({ cycleId, label: groupItems[0].cycle.label, items: groupItems });
    } else {
      pastCycles.push({ cycleId, label: groupItems[0].cycle.label, count: groupItems.length });
    }
  }

  return (
    <div className="max-w-2xl">
      {openCycleGroups.length > 0 ? (
        <div className="space-y-8 mb-8">
          {openCycleGroups.map((group) => {
            const total = group.items.length;
            const finishedCount = group.items.filter((i) => i.status === 'FINALIZADO').length;
            const progress = total > 0 ? (finishedCount / total) * 100 : 0;
            return (
              <div key={group.cycleId}>
                <h1 className="text-xl font-semibold text-p-primary-dark mb-1">{group.label}</h1>
                <p className="text-sm text-p-neutral mb-4">
                  Suas avaliações deste ciclo. Enquanto ele estiver aberto, você pode reabrir e
                  editar qualquer uma delas.
                </p>

                <div className="mb-4">
                  <PulseItemsByType items={group.items} />
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
          })}
        </div>
      ) : (
        <div className="mb-8">
          <h1 className="text-xl font-semibold text-p-primary-dark mb-1">Feedback Pulse</h1>
          <p className="text-sm text-p-neutral">Nenhum ciclo aberto no momento.</p>
        </div>
      )}

      {pastCycles.length > 0 && (
        <div className={openCycleGroups.length > 0 ? 'mt-8' : ''}>
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
