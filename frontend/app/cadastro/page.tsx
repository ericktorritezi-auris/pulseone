'use client';

import { useEffect, useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../../lib/api';

interface PublicOption {
  id: string;
  name: string;
  isManager?: boolean;
}

const emptyForm = {
  fullName: '',
  email: '',
  phone: '',
  areaId: '',
  positionId: '',
  managerId: '',
  password: '',
  confirmPassword: '',
};

export default function CadastroPage() {
  const router = useRouter();
  const [areas, setAreas] = useState<PublicOption[]>([]);
  const [positions, setPositions] = useState<PublicOption[]>([]);
  const [managers, setManagers] = useState<PublicOption[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get<PublicOption[]>('/public/areas').then(setAreas),
      api.get<PublicOption[]>('/public/positions').then(setPositions),
    ]).catch(() => {});
  }, []);

  useEffect(() => {
    if (!form.areaId) {
      setManagers([]);
      return;
    }
    api
      .get<PublicOption[]>(`/public/managers?areaId=${form.areaId}`)
      .then(setManagers)
      .catch(() => setManagers([]));
  }, [form.areaId]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (form.password !== form.confirmPassword) {
      setError('As senhas não coincidem.');
      return;
    }

    setSubmitting(true);
    try {
      await api.post('/auth/register', {
        fullName: form.fullName,
        email: form.email,
        phone: form.phone,
        areaId: form.areaId,
        positionId: form.positionId,
        managerId: form.managerId || undefined,
        password: form.password,
      });
      setSuccess(true);
      setTimeout(() => router.push('/login'), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao cadastrar.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-p-bg px-4 py-10">
      <div className="w-full max-w-md bg-white rounded-xl shadow-sm border border-slate-200 p-8">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-semibold text-p-primary-dark">
            Pulse<span className="text-p-secondary">One</span>
          </h1>
          <p className="text-sm text-p-neutral mt-1">Crie sua conta</p>
        </div>

        {success ? (
          <p className="text-sm text-p-success text-center">
            Cadastro realizado com sucesso! Enviamos um e-mail de confirmação — redirecionando pro
            login...
          </p>
        ) : (
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
              <label className="block text-sm font-medium text-p-primary-dark mb-1">Área</label>
              <select
                required
                value={form.areaId}
                onChange={(e) => setForm({ ...form, areaId: e.target.value, managerId: '' })}
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
              <label className="block text-sm font-medium text-p-primary-dark mb-1">Cargo</label>
              <select
                required
                value={form.positionId}
                onChange={(e) => setForm({ ...form, positionId: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              >
                <option value="">Selecione...</option>
                {positions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} {p.isManager && '(gestor)'}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-p-primary-dark mb-1">
                Gestor Direto (opcional)
              </label>
              <select
                value={form.managerId}
                onChange={(e) => setForm({ ...form, managerId: e.target.value })}
                disabled={!form.areaId}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm disabled:bg-slate-100"
              >
                <option value="">Nenhum / não sei</option>
                {managers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
              <p className="text-xs text-p-neutral mt-1">
                Se não souber ou seu gestor ainda não estiver cadastrado, deixe em branco — dá pra
                ajustar depois.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-p-primary-dark mb-1">Senha</label>
              <input
                type="password"
                required
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                placeholder="Mín. 8 caracteres, 1 maiúscula, 1 especial"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-p-primary-dark mb-1">Confirmar senha</label>
              <input
                type="password"
                required
                value={form.confirmPassword}
                onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-p-primary text-white py-2.5 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-60"
            >
              {submitting ? 'Cadastrando...' : 'Criar minha conta'}
            </button>

            <a href="/login" className="block text-center text-sm text-p-primary hover:underline">
              Já tenho conta — fazer login
            </a>
          </form>
        )}
      </div>
    </div>
  );
}
