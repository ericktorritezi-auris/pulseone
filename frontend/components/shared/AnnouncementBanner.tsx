'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { api } from '../../lib/api';
import { AnnouncementItem } from '../../lib/types';

// Componente isolado de propósito — busca os próprios dados, não depende
// de nada que o Dashboard já carrega. Visível pra todo mundo (colaborador,
// gestor, admin); só o cadastro é restrito a admin/gestor (seção 5.42).
export function AnnouncementBanner() {
  const [announcements, setAnnouncements] = useState<AnnouncementItem[]>([]);

  useEffect(() => {
    api
      .get<AnnouncementItem[]>('/announcements-active')
      .then(setAnnouncements)
      .catch(() => setAnnouncements([]));
  }, []);

  if (announcements.length === 0) return null;

  return (
    <div className="space-y-3 mb-6">
      {announcements.map((a) => (
        <div
          key={a.id}
          className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3"
        >
          <AlertTriangle size={18} className="text-amber-700 shrink-0 mt-0.5" />
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-amber-700 mb-0.5">
              Comunicado
            </p>
            <p className="text-sm font-semibold text-p-primary-dark whitespace-pre-wrap">{a.text}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
