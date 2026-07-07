'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { api } from '../../../../../lib/api';
import { PendingPulseFeedback } from '../../../../../lib/types';
import { AvatarInitials } from '../../../../../components/shared/AvatarInitials';

const TYPE_TITLES: Record<string, string> = {
  COLEGA: 'Avaliação dos Colegas',
  GESTOR: 'Avaliação do Gestor',
  AUTOAVALIACAO: 'Minha Autoavaliação',
};

export default function PulseListaPorTipoPage() {
  const params = useParams<{ type: string }>();
  const router = useRouter();
  const [items, setItems] = useState<PendingPulseFeedback[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<PendingPulseFeedback[]>('/pulse-feedbacks/pending')
      .then((all) => setItems(all.filter((i) => i.type === params.type)))
      .finally(() => setLoading(false));
  }, [params.type]);

  return (
    <div className="max-w-lg">
      <h1 className="text-xl font-semibold text-p-primary-dark mb-1">{TYPE_TITLES[params.type] ?? 'Avaliações'}</h1>
      <p className="text-sm text-p-neutral mb-6">Selecione quem você vai avaliar.</p>

      {loading && <p className="text-sm text-p-neutral">Carregando...</p>}

      <div className="space-y-2">
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => router.push(`/pulse/${item.id}`)}
            className="w-full flex items-center gap-3 bg-white rounded-xl border border-slate-200 p-4 hover:border-p-primary transition-colors text-left"
          >
            <AvatarInitials name={item.target.fullName} size="sm" />
            <span className="flex-1 text-sm font-medium text-p-primary-dark">{item.target.fullName}</span>
            <ChevronRight size={16} className="text-p-neutral" />
          </button>
        ))}
      </div>
    </div>
  );
}
