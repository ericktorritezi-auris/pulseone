'use client';

import { useEffect, useState, FormEvent } from 'react';
import { Plus, Pencil, Pause, Play, Trash2 } from 'lucide-react';
import { api } from '../../../lib/api';
import { useAuth } from '../../../lib/auth-context';
import { StatusBadge } from '../../../components/shared/StatusBadge';
import { Drawer } from '../../../components/shared/Drawer';
import { AnnouncementItem } from '../../../lib/types';

interface EligibleArea {
  id: string;
  name: string;
}

export default function ComunicadosPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<AnnouncementItem[]>([]);
  const [eligibleAreas, setEligibleAreas] = useState<EligibleArea[]>([]);
  const [loading, setLoading] = useState(true);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [scope, setScope] = useState<'geral' | 'area'>('geral');
  const [areaIds, setAreaIds] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const canManage = user?.role === 'ADMIN' || user?.role === 'GESTOR';

  async function loadData() {
    setLoading(true);
    try {
      const [itemsRes, areasRes] = await Promise.all([
        api.get<AnnouncementItem[]>('/announcements'),
        canManage ? api.get<EligibleArea[]>('/announcements/eligible-areas') : Promise.resolve([]),
      ]);
      setItems(itemsRes);
      setEligibleAreas(areasRes);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (user?.role !== 'ADMIN' && user?.role !== 'GESTOR') {
    return <p className="text-sm text-p-neutral">Esta página é exclusiva de administrador e gestor.</p>;
  }

  function openCreate() {
    setEditingId(null);
    setText('');
    setScope('geral');
    setAreaIds([]);
    setError('');
    setDrawerOpen(true);
  }

  function openEdit(item: AnnouncementItem) {
    setEditingId(item.id);
    setText(item.text);
    setError('');
    setDrawerOpen(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (!editingId && scope === 'area' && areaIds.length === 0) {
      setError('Selecione ao menos uma área.');
      return;
    }
    setSubmitting(true);
    try {
      if (editingId) {
        // Edição só troca o texto — a área do comunicado é definida na
        // criação e não muda depois (mesmo padrão do backend hoje).
        await api.patch(`/announcements/${editingId}`, { text });
      } else {
        await api.post('/announcements', {
          text,
          ...(scope === 'area' && areaIds.length > 0 ? { areaIds } : {}),
        });
      }
      setDrawerOpen(false);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggleActive(id: string) {
    await api.patch(`/announcements/${id}/toggle-active`);
    await loadData();
  }

  async function handleRemove(id: string) {
    if (!confirm('Excluir este comunicado permanentemente? Não tem como desfazer.')) return;
    await api.delete(`/announcements/${id}`);
    await loadData();
  }

  if (loading) return <p className="text-sm text-p-neutral">Carregando...</p>;

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-p-primary-dark">Comunicados</h1>
          <p className="text-sm text-p-neutral">
            Avisos que aparecem no topo do painel — geral (todo mundo) ou só de uma área
            específica. Só os ativos ficam visíveis.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 bg-p-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 shrink-0"
        >
          <Plus size={16} />
          Novo Comunicado
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {items.length === 0 && (
          <p className="text-sm text-p-neutral text-center py-8">Nenhum comunicado cadastrado ainda.</p>
        )}

        {items.map((item) => (
          <div
            key={item.id}
            className={`flex items-start justify-between gap-4 px-5 py-4 border-b border-slate-100 last:border-b-0 ${
              !item.active ? 'opacity-50' : ''
            }`}
          >
            <div className="min-w-0">
              <p className="text-sm text-p-primary-dark whitespace-pre-wrap mb-2">{item.text}</p>
              <div className="flex items-center gap-2 text-xs text-p-neutral flex-wrap">
                <StatusBadge status={item.active ? 'ATIVO' : 'INATIVO'} />
                <span className="text-[10px] font-semibold uppercase tracking-wide bg-blue-50 text-p-primary px-2 py-0.5 rounded-full">
                  {item.areas && item.areas.length > 0
                    ? item.areas.map((a) => a.name).join(' + ')
                    : item.area?.name ?? 'Geral'}
                </span>
                <span>
                  criado por {item.createdBy?.fullName ?? '—'} em{' '}
                  {new Date(item.createdAt).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                </span>
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              <button onClick={() => openEdit(item)} className="text-p-neutral hover:text-p-primary">
                <Pencil size={16} />
              </button>
              <button onClick={() => handleToggleActive(item.id)} className="text-p-neutral hover:text-p-warning">
                {item.active ? <Pause size={16} /> : <Play size={16} />}
              </button>
              <button onClick={() => handleRemove(item.id)} className="text-p-neutral hover:text-red-600">
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>

      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title={editingId ? 'Editar Comunicado' : 'Novo Comunicado'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-p-primary-dark mb-1">Comunicado</label>
            <textarea
              required
              rows={6}
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm resize-none"
              placeholder="Escreva o comunicado..."
            />
            {!editingId && (
              <p className="text-xs text-p-neutral mt-1">
                Ao salvar, os colaboradores alcançados recebem um e-mail avisando sobre este
                comunicado.
              </p>
            )}
          </div>

          {!editingId && (
            <div>
              <label className="block text-sm font-medium text-p-primary-dark mb-2">Alcance</label>
              <div className="flex gap-4 mb-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    checked={scope === 'geral'}
                    onChange={() => {
                      setScope('geral');
                      setAreaIds([]);
                    }}
                  />
                  Geral (todo mundo)
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="radio" checked={scope === 'area'} onChange={() => setScope('area')} />
                  Áreas selecionadas
                </label>
              </div>
              {scope === 'area' && (
                <div className="border border-slate-200 rounded-lg p-3 space-y-1.5 max-h-48 overflow-y-auto">
                  {eligibleAreas.map((a) => (
                    <label key={a.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={areaIds.includes(a.id)}
                        onChange={(e) =>
                          setAreaIds((prev) =>
                            e.target.checked ? [...prev, a.id] : prev.filter((id) => id !== a.id),
                          )
                        }
                      />
                      {a.name}
                    </label>
                  ))}
                </div>
              )}
              {user?.role === 'GESTOR' && (
                <p className="text-xs text-p-neutral mt-1">
                  Você só pode escolher entre as áreas que gerencia.
                </p>
              )}
            </div>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              className="flex-1 border border-slate-300 text-p-primary-dark py-2.5 rounded-lg text-sm font-medium"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 bg-p-primary text-white py-2.5 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-60"
            >
              {submitting ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      </Drawer>
    </div>
  );
}
