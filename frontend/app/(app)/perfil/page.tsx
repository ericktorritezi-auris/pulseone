'use client';

import { useState, FormEvent } from 'react';
import { useAuth } from '../../../lib/auth-context';
import { api } from '../../../lib/api';
import { AvatarInitials } from '../../../components/shared/AvatarInitials';

export default function ProfilePage() {
  const { user } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (!user) return null;

  async function handleChangePassword(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess(false);

    if (newPassword !== confirmPassword) {
      setError('As senhas não coincidem.');
      return;
    }

    setSubmitting(true);
    try {
      await api.post('/auth/change-password', { currentPassword, newPassword });
      setSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao trocar a senha.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-lg">
      <h1 className="text-xl font-semibold text-p-primary-dark mb-6">Meu Perfil</h1>

      <div className="bg-white rounded-xl border border-slate-200 p-6 flex items-center gap-4 mb-4">
        <AvatarInitials name={user.fullName} size="lg" />
        <div>
          <p className="text-lg font-semibold text-p-primary-dark">{user.fullName}</p>
          <p className="text-sm text-p-neutral">{user.email}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-3 mb-4">
        {user.areaName && (
          <div className="flex justify-between text-sm">
            <span className="text-p-neutral">Área</span>
            <span className="text-p-primary-dark font-medium">{user.areaName}</span>
          </div>
        )}
        {user.positionName && (
          <div className="flex justify-between text-sm">
            <span className="text-p-neutral">Cargo</span>
            <span className="text-p-primary-dark font-medium">{user.positionName}</span>
          </div>
        )}
        <div className="flex justify-between text-sm">
          <span className="text-p-neutral">Perfil de acesso</span>
          <span className="text-p-primary-dark font-medium">{user.role}</span>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="text-sm font-semibold text-p-primary-dark mb-3">Alterar Senha</h2>
        <form onSubmit={handleChangePassword} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-p-neutral mb-1">Senha atual</label>
            <input
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-p-neutral mb-1">Nova senha</label>
            <input
              type="password"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              placeholder="Mín. 8 caracteres, 1 maiúscula, 1 especial"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-p-neutral mb-1">Confirmar nova senha</label>
            <input
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
          {success && <p className="text-sm text-p-success">Senha alterada com sucesso.</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-p-primary text-white py-2.5 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-60"
          >
            {submitting ? 'Salvando...' : 'Alterar Senha'}
          </button>
        </form>
      </div>
    </div>
  );
}
