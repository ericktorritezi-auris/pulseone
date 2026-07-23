'use client';

import { useEffect, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import { api } from '../../lib/api';
import { Notification } from '../../lib/types';

export function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  async function load() {
    try {
      const data = await api.get<Notification[]>('/notifications');
      setNotifications(data);
    } catch {
      // silencioso — sino não deve quebrar a experiência do usuário
    }
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 60_000); // repolling simples a cada 1min
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  async function handleOpen() {
    setOpen((v) => !v);
  }

  async function markAsRead(id: string) {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    try {
      await api.patch(`/notifications/${id}/read`);
    } catch {
      // se falhar, o próximo polling corrige o estado
    }
  }

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div className="relative" ref={ref}>
      <button onClick={handleOpen} className="relative text-p-neutral hover:text-p-primary-dark transition-colors">
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-p-warning text-white text-[10px] rounded-full flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl border border-slate-200 shadow-lg z-50 max-h-96 overflow-y-auto">
          <div className="px-4 py-3 border-b border-slate-100">
            <p className="text-sm font-medium text-p-primary-dark">Notificações</p>
          </div>
          {notifications.length === 0 ? (
            <p className="text-sm text-p-neutral text-center py-6">Nenhuma notificação por aqui.</p>
          ) : (
            notifications.map((n) => (
              <button
                key={n.id}
                onClick={() => markAsRead(n.id)}
                className={`block w-full text-left px-4 py-3 border-b border-slate-50 last:border-0 hover:bg-slate-50 ${
                  n.read ? 'opacity-60' : ''
                }`}
              >
                <p className="text-sm font-medium text-p-primary-dark">{n.title}</p>
                <p className="text-xs text-p-neutral mt-0.5">{n.message}</p>
                <p className="text-[11px] text-p-neutral mt-1">
                  {new Date(n.createdAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                </p>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
