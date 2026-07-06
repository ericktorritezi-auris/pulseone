'use client';

import { useEffect, useState, FormEvent } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { api } from '../../../../lib/api';
import { Area } from '../../../../lib/types';
import { Drawer } from '../../../../components/shared/Drawer';

export default function AreasPage() {
  const [areas, setAreas] = useState<Area[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function loadData() {
    setLoading(true);
    try {
      setAreas(await api.get<Area[]>('/areas'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar áreas.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  function openCreate() {
    setEditingId(null);
    setName('');
    setError('');
    setDrawerOpen(true);
  }

  function openEdit(area: Area) {
    setEditingId(area.id);
    setName(area.name);
    setError('');
    setDrawerOpen(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      if (editingId) {
        await api.patch(`/areas/${editingId}`, { name });
      } else {
        await api.post('/areas', { name });
      }
      setDrawerOpen(false);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRemove(id: string) {
    if (!confirm('Excluir esta área? Só é possível se não houver pessoas vinculadas.')) return;
    try {
      await api.delete(`/areas/${id}`);
      await loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao excluir.');
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-p-primary-dark">Áreas</h1>
          <p className="text-sm text-p-neutral">Departamentos da organização — cada avaliação Pulse é fechada por área.</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 bg-p-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90"
        >
          <Plus size={16} />
          Nova Área
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-p-neutral text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-3">Nome</th>
              <th className="text-right px-4 py-3">Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={2} className="text-center py-8 text-p-neutral">Carregando...</td>
              </tr>
            )}
            {!loading && areas.length === 0 && (
              <tr>
                <td colSpan={2} className="text-center py-8 text-p-neutral">Nenhuma área cadastrada ainda.</td>
              </tr>
            )}
            {areas.map((area) => (
              <tr key={area.id} className="border-t border-slate-100">
                <td className="px-4 py-3 font-medium text-p-primary-dark">{area.name}</td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    <button onClick={() => openEdit(area)} className="text-p-neutral hover:text-p-primary">
                      <Pencil size={16} />
                    </button>
                    <button onClick={() => handleRemove(area.id)} className="text-p-neutral hover:text-red-600">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title={editingId ? 'Editar Área' : 'Nova Área'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-p-primary-dark mb-1">Nome</label>
            <input
              required
              minLength={2}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              placeholder="Ex: Marketing"
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
    </div>
  );
}
