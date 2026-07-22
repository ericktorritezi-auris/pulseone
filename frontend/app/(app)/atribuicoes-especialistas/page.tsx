'use client';

import { useEffect, useState, FormEvent } from 'react';
import { Plus, Pencil, Pause, Play, Trash2, ChevronRight } from 'lucide-react';
import { api } from '../../../lib/api';
import { useAuth } from '../../../lib/auth-context';
import { AvatarInitials } from '../../../components/shared/AvatarInitials';
import { StatusBadge } from '../../../components/shared/StatusBadge';
import { Drawer } from '../../../components/shared/Drawer';
import { SpecialistAssignmentItem, EligibleSpecialistUser } from '../../../lib/types';

const emptyForm = { userId: '', description: '' };

export default function AtribuicoesEspecialistasPage() {
  const { user } = useAuth();
  const canManage = user?.role === 'ADMIN' || user?.role === 'GESTOR';

  const [items, setItems] = useState<SpecialistAssignmentItem[]>([]);
  const [eligibleUsers, setEligibleUsers] = useState<EligibleSpecialistUser[]>([]);
  const [loading, setLoading] = useState(true);

  // Gerenciamento (admin/gestor)
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Consulta (colaborador)
  const [viewing, setViewing] = useState<SpecialistAssignmentItem | null>(null);

  async function loadData() {
    setLoading(true);
    try {
      const [itemsRes, eligibleRes] = await Promise.all([
        api.get<SpecialistAssignmentItem[]>('/specialist-assignments'),
        canManage ? api.get<EligibleSpecialistUser[]>('/specialist-assignments/eligible-users') : Promise.resolve([]),
      ]);
      setItems(itemsRes);
      setEligibleUsers(eligibleRes);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setError('');
    setDrawerOpen(true);
  }

  function openEdit(item: SpecialistAssignmentItem) {
    setEditingId(item.id);
    setForm({ userId: item.user.id, description: item.description });
    setError('');
    setDrawerOpen(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      if (editingId) {
        await api.patch(`/specialist-assignments/${editingId}`, { description: form.description });
      } else {
        await api.post('/specialist-assignments', form);
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
    await api.patch(`/specialist-assignments/${id}/toggle-active`);
    await loadData();
  }

  async function handleRemove(id: string) {
    if (!confirm('Excluir esta atribuição permanentemente? Não tem como desfazer.')) return;
    await api.delete(`/specialist-assignments/${id}`);
    await loadData();
  }

  if (loading) return <p className="text-sm text-p-neutral">Carregando...</p>;

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-p-primary-dark">Atribuições Especialistas</h1>
          <p className="text-sm text-p-neutral">
            {canManage
              ? 'Cadastro de quem é responsável por cada assunto — pra saber pra quem escalar.'
              : 'Veja quem é responsável por cada assunto, pra saber pra quem escalar.'}
          </p>
        </div>
        {canManage && (
          <button
            onClick={openCreate}
            className="flex items-center gap-2 bg-p-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 shrink-0"
          >
            <Plus size={16} />
            Cadastrar
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {items.length === 0 && (
          <p className="text-sm text-p-neutral text-center py-8">Nenhuma atribuição cadastrada ainda.</p>
        )}

        {items.map((item) => (
          <div
            key={item.id}
            className={`flex items-center justify-between gap-4 px-5 py-4 border-b border-slate-100 last:border-b-0 cursor-pointer hover:bg-slate-50 ${
              !item.active ? 'opacity-50' : ''
            }`}
            onClick={() => setViewing(item)}
          >
            <div className="flex items-center gap-3 min-w-0">
              <AvatarInitials name={item.user.fullName} size="sm" />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-p-primary-dark truncate">{item.user.fullName}</p>
                  {canManage && <StatusBadge status={item.active ? 'ATIVO' : 'INATIVO'} />}
                </div>
                <p className="text-xs text-p-neutral truncate max-w-md">
                  {canManage
                    ? item.description
                    : [item.user.position?.name, item.user.area?.name].filter(Boolean).join(' · ')}
                </p>
              </div>
            </div>

            {canManage ? (
              <div className="flex gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
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
            ) : (
              <ChevronRight size={16} className="text-p-neutral shrink-0" />
            )}
          </div>
        ))}
      </div>

      {/* Drawer de cadastro/edição — admin/gestor */}
      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title={editingId ? 'Editar Atribuição' : 'Cadastrar Atribuição'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-p-primary-dark mb-1">Colaborador</label>
            <select
              required
              disabled={!!editingId}
              value={form.userId}
              onChange={(e) => setForm({ ...form, userId: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm disabled:bg-slate-100"
            >
              <option value="">Selecione...</option>
              {eligibleUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-p-primary-dark mb-1">Atribuições</label>
            <textarea
              required
              rows={5}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm resize-none"
              placeholder="Descreva livremente do que essa pessoa cuida..."
            />
          </div>

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

      {/* Modal de consulta — colaborador */}
      {viewing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <AvatarInitials name={viewing.user.fullName} size="md" />
              <div>
                <p className="text-base font-bold text-p-primary-dark">{viewing.user.fullName}</p>
                <p className="text-xs text-p-neutral">
                  {[viewing.user.position?.name, viewing.user.area?.name].filter(Boolean).join(' · ')}
                </p>
              </div>
            </div>
            <div className="bg-slate-50 rounded-lg p-4 text-sm text-p-primary-dark whitespace-pre-wrap mb-5">
              {viewing.description}
            </div>
            <button
              onClick={() => setViewing(null)}
              className="w-full border border-slate-300 text-p-primary-dark py-2.5 rounded-lg text-sm font-medium"
            >
              Fechar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
