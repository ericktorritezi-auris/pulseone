'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { api } from '../../../../../lib/api';
import { PendingPulseFeedback } from '../../../../../lib/types';
import { PulseItemsByType } from '../../../../../components/shared/PulseItemsByType';

export default function PulseCicloHistoricoPage() {
  const params = useParams<{ cycleId: string }>();
  const router = useRouter();
  const [items, setItems] = useState<PendingPulseFeedback[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<PendingPulseFeedback[]>('/pulse-feedbacks/mine')
      .then((all) => setItems(all.filter((i) => i.cycleId === params.cycleId)))
      .finally(() => setLoading(false));
  }, [params.cycleId]);

  if (loading) return <p className="text-sm text-p-neutral">Carregando...</p>;

  if (items.length === 0) {
    return <p className="text-sm text-p-neutral">Nenhuma avaliação encontrada para este ciclo.</p>;
  }

  return (
    <div className="max-w-2xl">
      <button
        onClick={() => router.push('/pulse')}
        className="flex items-center gap-1.5 text-sm text-p-neutral hover:text-p-primary mb-4"
      >
        <ArrowLeft size={16} />
        Voltar
      </button>

      <h1 className="text-xl font-semibold text-p-primary-dark mb-1">{items[0].cycle.label}</h1>
      <p className="text-sm text-p-neutral mb-6">
        Ciclo encerrado — suas avaliações ficam disponíveis aqui apenas para consulta.
      </p>

      <PulseItemsByType items={items} />
    </div>
  );
}
