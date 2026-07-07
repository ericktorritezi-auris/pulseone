'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { api } from '../../../../lib/api';
import { Feedback } from '../../../../lib/types';
import { FeedbackList } from '../../../../components/shared/FeedbackList';

export default function FeedbacksRecebidosPage() {
  const [items, setItems] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<Feedback[]>('/feedbacks/received')
      .then(setItems)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-p-primary-dark">Feedbacks Recebidos</h1>
          <p className="text-sm text-p-neutral">Tudo que você já recebeu de colegas e gestores.</p>
        </div>
        <Link
          href="/feedbacks/novo"
          className="flex items-center gap-2 bg-p-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90"
        >
          <Plus size={16} />
          Enviar Feedback
        </Link>
      </div>

      <FeedbackList items={items} direction="received" loading={loading} />
    </div>
  );
}
