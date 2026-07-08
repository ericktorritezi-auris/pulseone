'use client';

import { useEffect, useState, FormEvent } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { api } from '../../../../lib/api';
import { useAuth } from '../../../../lib/auth-context';
import { Area, ManagerOption, Person, Position } from '../../../../lib/types';
import { Drawer } from '../../../../components/shared/Drawer';
import { AvatarInitials } from '../../../../components/shared/AvatarInitials';
import { StatusBadge } from '../../../../components/shared/StatusBadge';

const emptyForm = {
  fullName: '',
  email: '',
  phone: '',
  areaId: '',
  positionId: '',
  managerId: '',
  password: '',
};

export default function PessoasPage() {
  const { user } = useAuth();
  const [people, setPeople] = useState<Person[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [managers, setManagers] = useState<ManagerOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [masterModalOpen, setMasterModalOpen] = useState(false);
  const [masterPasswordInput, setMasterPasswordInput] = useState('');
  const [masterError, setMasterError] = useState('');

  const [adminNewPassword, setAdminNewPassword] = useState('');
  const [adminPasswordSubmitting, setAdminPasswordSubmitting] = useState(false);
  const [adminPasswordError, setAdminPasswordError] = useState('');
  const [adminPasswordSuccess, setAdminPasswordSuccess] = useState(false);

  // REGRA (seção 5.3/5.5 do mapeamento técnico): gestor só cadastra na
  // própria área. O campo vem travado e pré-preenchido; admin escolhe livremente.
  const isGestor = user?.role === 'GESTOR';
  const effectiveAreaId = isGestor ? user!.areaId : form.areaId;

  async function loadData() {
    setLoading(true);
    try {
      const [peopleRes, areasRes, positionsRes] = await Promise.all([
        api.get<Person[]>('/users'),
        api.get<Area[]>('/areas'),
        api.get<Position[]>('/positions'),
      ]);
      setPeople(peopleRes);
      setAreas(areasRes);
      setPositions(positionsRes);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar dados.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  // Recarrega a lista de possíveis gestores diretos sempre que a área
  // efetiva (do form ou fixa do gestor) muda — o gestor direto precisa
  // estar SEMPRE na mesma área da pessoa sendo cadastrada/editada.
  useEffect(() => {
    if (!drawerOpen || !effectiveAreaId) {
      setManagers([]);
      return;
    }
    const query = new URLSearchParams({ areaId: effectiveAreaId });
    if (editingId) query.set('excludeUserId', editingId);
    api.get<ManagerOption[]>(`/users/managers?${query.toString()}`).then(setManagers).catch(() => setManagers([]));
  }, [drawerOpen, effectiveAreaId, editingId]);

  function openCreate() {
    setEditingId(null);
    setForm({ ...emptyForm, areaId: isGestor ? user!.areaId : '' });
    setError('');
    setDrawerOpen(true);
  }

  function openEdit(person: Person) {
    setEditingId(person.id);
    setForm({
      fullName: person.fullName,
      email: person.email,
      phone: person.phone,
      areaId: person.areaId,
      positionId: person.positionId,
      managerId: person.managerId ?? '',
      password: '',
    });
    setError('');
    setAdminNewPassword('');
    setAdminPasswordError('');
    setAdminPasswordSuccess(false);
    setDrawerOpen(true);
  }

  async function submitWithOverride(masterPasswordOverride?: string) {
    setError('');
    setSubmitting(true);
    try {
      if (editingId) {
        await api.patch(`/users/${editingId}`, {
          fullName: form.fullName,
          email: form.email,
          phone: form.phone,
          positionId: form.positionId,
          managerId: form.managerId || null,
          ...(isGestor ? {} : { areaId: form.areaId }),
          ...(masterPasswordOverride ? { masterPasswordOverride } : {}),
        });
      } else {
        await api.post('/users', {
          fullName: form.fullName,
          email: form.email,
          phone: form.phone,
          positionId: form.positionId,
          managerId: form.managerId || undefined,
          password: form.password,
          // Se for gestor, o backend ignora isso de qualquer forma e usa a
          // própria área — mandamos mesmo assim por clareza no payload.
          areaId: isGestor ? user!.areaId : form.areaId,
          ...(masterPasswordOverride ? { masterPasswordOverride } : {}),
        });
      }
      setDrawerOpen(false);
      setMasterModalOpen(false);
      await loadData();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao salvar.';
      if (message.includes('EMAIL_JA_EXISTE')) {
        if (masterPasswordOverride) {
          // Já estava no modal tentando com uma senha — ela veio errada.
          setMasterError('Senha MASTER incorreta. Tente novamente.');
        } else {
          // Primeira detecção — oferece a liberação por senha MASTER.
          setMasterModalOpen(true);
          setMasterError('');
        }
      } else {
        setError(message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await submitWithOverride();
  }

  async function handleConfirmMasterPassword() {
    if (!masterPasswordInput.trim()) return;
    await submitWithOverride(masterPasswordInput);
  }

  function handleNoMasterPassword() {
    setMasterModalOpen(false);
    setMasterPasswordInput('');
    setMasterError('');
    setError('Este e-mail já está cadastrado. Utilize um novo e-mail.');
  }

  // Redefinição de senha exclusiva do admin (seção 5.19) — não exige a
  // senha atual da pessoa, é uma ação autorizada pelo papel de admin.
  async function handleAdminResetPassword() {
    if (!editingId || !adminNewPassword.trim()) return;
    setAdminPasswordSubmitting(true);
    setAdminPasswordError('');
    setAdminPasswordSuccess(false);
    try {
      await api.patch(`/users/${editingId}/password`, { newPassword: adminNewPassword });
      setAdminPasswordSuccess(true);
      setAdminNewPassword('');
    } catch (err) {
      setAdminPasswordError(err instanceof Error ? err.message : 'Erro ao redefinir a senha.');
    } finally {
      setAdminPasswordSubmitting(false);
    }
  }

  async function handleRemove(id: string) {
    if (!confirm('Inativar esta pessoa? Ela deixará de acessar o sistema, mas o histórico é mantido.')) return;
    await api.delete(`/users/${id}`);
    await loadData();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-p-primary-dark">Pessoas</h1>
          <p className="text-sm text-p-neutral">
            {isGestor ? `Colaboradores da área ${user?.areaName}` : 'Todos os colaboradores da organização'}
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 bg-p-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90"
        >
          <Plus size={16} />
          Cadastrar Pessoa
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-p-neutral text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-3">Nome</th>
              <th className="text-left px-4 py-3">Área</th>
              <th className="text-left px-4 py-3">Cargo</th>
              <th className="text-left px-4 py-3">Gestor Direto</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-right px-4 py-3">Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={6} className="text-center py-8 text-p-neutral">
                  Carregando...
                </td>
              </tr>
            )}
            {!loading && people.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center py-8 text-p-neutral">
                  Nenhuma pessoa cadastrada ainda.
                </td>
              </tr>
            )}
            {people.map((person) => (
              <tr key={person.id} className="border-t border-slate-100">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <AvatarInitials name={person.fullName} size="sm" />
                    <div>
                      <p className="font-medium text-p-primary-dark">{person.fullName}</p>
                      <p className="text-xs text-p-neutral">{person.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-p-neutral">{person.area?.name ?? '—'}</td>
                <td className="px-4 py-3 text-p-neutral">{person.position?.name ?? '—'}</td>
                <td className="px-4 py-3 text-p-neutral">{person.manager?.fullName ?? '—'}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={person.active ? 'ATIVO' : 'INATIVO'} />
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    <button onClick={() => openEdit(person)} className="text-p-neutral hover:text-p-primary">
                      <Pencil size={16} />
                    </button>
                    <button onClick={() => handleRemove(person.id)} className="text-p-neutral hover:text-red-600">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={editingId ? 'Editar Pessoa' : 'Cadastrar Pessoa'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-p-primary-dark mb-1">Nome completo</label>
            <input
              required
              value={form.fullName}
              onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-p-primary-dark mb-1">E-mail</label>
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-p-primary-dark mb-1">Telefone</label>
            <input
              required
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              placeholder="(11) 98765-4321"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-p-primary-dark mb-1">
              Área {isGestor && <span className="text-xs text-p-neutral font-normal">(fixa — definida pelo seu perfil de gestor)</span>}
            </label>
            <select
              required
              disabled={isGestor}
              value={isGestor ? user!.areaId : form.areaId}
              onChange={(e) => setForm({ ...form, areaId: e.target.value, managerId: '' })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm disabled:bg-slate-100 disabled:text-p-neutral"
            >
              <option value="">Selecione...</option>
              {areas.map((area) => (
                <option key={area.id} value={area.id}>
                  {area.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-p-primary-dark mb-1">Cargo</label>
            <select
              required
              value={form.positionId}
              onChange={(e) => setForm({ ...form, positionId: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            >
              <option value="">Selecione...</option>
              {positions.map((position) => (
                <option key={position.id} value={position.id}>
                  {position.name} {position.isManager && '(gestor)'}
                </option>
              ))}
            </select>
            <p className="text-xs text-p-neutral mt-1">
              O perfil de acesso (gestor/colaborador) é definido automaticamente pelo cargo escolhido.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-p-primary-dark mb-1">Gestor Direto</label>
            <select
              value={form.managerId}
              onChange={(e) => setForm({ ...form, managerId: e.target.value })}
              disabled={!effectiveAreaId}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm disabled:bg-slate-100"
            >
              <option value="">Nenhum (topo da hierarquia)</option>
              {managers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.fullName}
                </option>
              ))}
            </select>
            <p className="text-xs text-p-neutral mt-1">
              Quem avalia esta pessoa no ciclo Pulse e com quem ela forma o mesmo time imediato pra
              avaliação de colegas. Deixe em branco se não houver ninguém acima dentro do sistema.
            </p>
          </div>

          {!editingId && (
            <div>
              <label className="block text-sm font-medium text-p-primary-dark mb-1">Senha inicial</label>
              <input
                type="password"
                required
                minLength={8}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                placeholder="Mín. 8 caracteres, 1 maiúscula, 1 especial"
              />
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

        {/* Redefinir senha — exclusivo do ADMIN, pra qualquer pessoa (seção
            5.19). Fica fora do <form> principal de propósito, pra não
            misturar os dois envios. */}
        {user?.role === 'ADMIN' && editingId && (
          <div className="mt-6 pt-6 border-t border-slate-200">
            <h3 className="text-sm font-semibold text-p-primary-dark mb-1">Redefinir Senha</h3>
            <p className="text-xs text-p-neutral mb-3">
              Só o administrador pode fazer isso. A pessoa será obrigada a trocar essa senha no
              próximo login.
            </p>
            <input
              type="password"
              value={adminNewPassword}
              onChange={(e) => setAdminNewPassword(e.target.value)}
              placeholder="Nova senha (mín. 8 caracteres, 1 maiúscula, 1 especial)"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm mb-2"
            />
            {adminPasswordError && <p className="text-sm text-red-600 mb-2">{adminPasswordError}</p>}
            {adminPasswordSuccess && (
              <p className="text-sm text-p-success mb-2">Senha redefinida com sucesso.</p>
            )}
            <button
              type="button"
              onClick={handleAdminResetPassword}
              disabled={adminPasswordSubmitting || !adminNewPassword.trim()}
              className="w-full border border-slate-300 text-p-primary-dark py-2 rounded-lg text-sm font-medium hover:border-p-primary disabled:opacity-50"
            >
              {adminPasswordSubmitting ? 'Redefinindo...' : 'Redefinir senha desta pessoa'}
            </button>
          </div>
        )}
      </Drawer>

      {masterModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6">
            <h3 className="text-base font-semibold text-p-primary-dark mb-2">E-mail já cadastrado</h3>
            <p className="text-sm text-p-neutral mb-4">
              Já existe uma conta com esse e-mail — pode ser a mesma pessoa acumulando outro papel
              no sistema (ex: é admin e também gestor de uma área). Para cadastrar esse e-mail de
              novo, digite a senha MASTER do sistema.
            </p>
            <input
              type="password"
              autoFocus
              value={masterPasswordInput}
              onChange={(e) => setMasterPasswordInput(e.target.value)}
              placeholder="Senha MASTER"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm mb-2"
            />
            {masterError && <p className="text-sm text-red-600 mb-2">{masterError}</p>}
            <div className="flex gap-3 mt-3">
              <button
                onClick={handleNoMasterPassword}
                className="flex-1 border border-slate-300 text-p-primary-dark py-2.5 rounded-lg text-sm font-medium"
              >
                Não tenho a senha master
              </button>
              <button
                onClick={handleConfirmMasterPassword}
                disabled={submitting || !masterPasswordInput.trim()}
                className="flex-1 bg-p-primary text-white py-2.5 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-60"
              >
                {submitting ? 'Verificando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
