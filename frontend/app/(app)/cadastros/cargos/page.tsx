'use client';

import { useEffect, useState, FormEvent } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { api } from '../../../../lib/api';
import { Position, Area } from '../../../../lib/types';
import { Drawer } from '../../../../components/shared/Drawer';
import { StatusBadge } from '../../../../components/shared/StatusBadge';

const emptyForm = { name: '', isManager: false, areaId: '' };

export default function CargosPage() {
  const [positions, setPositions] = useState<Position[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function loadData() {
    setLoading(true);
    try {
      const [positionsData, areasData] = await Promise.all([
        api.get<Position[]>('/positions'),
        api.get<Area[]>('/areas'),
      ]);
      setPositions(positionsData);
      setAreas(areasData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar cargos.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setError('');
    setDrawerOpen(true);
  }

  function openEdit(position: Position) {
    setEditingId(position.id);
    setForm({ name: position.name, isManager: position.isManager, areaId: position.areaId });
    setError('');
    setDrawerOpen(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      if (editingId) {
        await api.patch(`/positions/${editingId}`, form);
      } else {
        await api.post('/positions', form);
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
    if (!confirm('Excluir este cargo? Só é possível se não houver pessoas vinculadas.')) return;
    try {
      await api.delete(`/positions/${id}`);
      await loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao excluir.');
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-p-primary-dark">Cargos</h1>
          <p className="text-sm text-p-neutral">
            Cada cargo pertence a uma área. Cargos marcados como "é gestor" definem
            automaticamente quem tem acesso de gestão naquela área.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 bg-p-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90"
        >
          <Plus size={16} />
          Novo Cargo
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-p-neutral text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-3">Nome</th>
              <th className="text-left px-4 py-3">Área</th>
              <th className="text-left px-4 py-3">É gestor?</th>
              <th className="text-right px-4 py-3">Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={4} className="text-center py-8 text-p-neutral">Carregando...</td>
              </tr>
            )}
            {!loading && positions.length === 0 && (
              <tr>
                <td colSpan={4} className="text-center py-8 text-p-neutral">Nenhum cargo cadastrado ainda.</td>
              </tr>
            )}
            {positions.map((position) => (
              <tr key={position.id} className="border-t border-slate-100">
                <td className="px-4 py-3 font-medium text-p-primary-dark">{position.name}</td>
                <td className="px-4 py-3 text-p-neutral">{position.area?.name ?? '—'}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={position.isManager ? 'ATIVO' : 'INATIVO'} />
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    <button onClick={() => openEdit(position)} className="text-p-neutral hover:text-p-primary">
                      <Pencil size={16} />
                    </button>
                    <button onClick={() => handleRemove(position.id)} className="text-p-neutral hover:text-red-600">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title={editingId ? 'Editar Cargo' : 'Novo Cargo'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-p-primary-dark mb-1">Área</label>
            <select
              required
              value={form.areaId}
              onChange={(e) => setForm({ ...form, areaId: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            >
              <option value="">Selecione...</option>
              {areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-p-primary-dark mb-1">Nome do Cargo</label>
            <input
              required
              minLength={2}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              placeholder="Ex: Gerente de Marketing"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-p-primary-dark mb-2">É gestor?</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  checked={form.isManager}
                  onChange={() => setForm({ ...form, isManager: true })}
                />
                Sim, este cargo é gestor
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  checked={!form.isManager}
                  onChange={() => setForm({ ...form, isManager: false })}
                />
                Não, este cargo não é gestor
              </label>
            </div>
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
