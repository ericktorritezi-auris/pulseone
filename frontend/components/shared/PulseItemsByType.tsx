'use client';

import { useRouter } from 'next/navigation';
import { ChevronRight, ClipboardCheck, User, Users } from 'lucide-react';
import { PendingPulseFeedback } from '../../lib/types';
import { AvatarInitials } from './AvatarInitials';
import { StatusBadge } from './StatusBadge';

const TYPE_LABELS: Record<string, { title: string; icon: typeof User }> = {
  AUTOAVALIACAO: { title: 'Minha Autoavaliação', icon: User },
  GESTOR: { title: 'Avaliação do Gestor', icon: ClipboardCheck },
  COLEGA: { title: 'Avaliação dos Colegas', icon: Users },
};

export function PulseItemsByType({ items }: { items: PendingPulseFeedback[] }) {
  const router = useRouter();

  const grouped = items.reduce<Record<string, PendingPulseFeedback[]>>((acc, item) => {
    (acc[item.type] ??= []).push(item);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
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
  );
}
