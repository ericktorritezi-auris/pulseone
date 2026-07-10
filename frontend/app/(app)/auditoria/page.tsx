'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '../../../lib/auth-context';
import { api } from '../../../lib/api';
import { AuditLogEntry } from '../../../lib/types';
import { StatusBadge } from '../../../components/shared/StatusBadge';

const ACTION_FILTERS = [
  { value: '', label: 'Todas as ações' },
  { value: 'LOGIN', label: 'Login' },
  { value: 'LOGOUT', label: 'Logout' },
  { value: 'CADASTRO', label: 'Cadastro' },
  { value: 'EDICAO', label: 'Edição' },
  { value: 'EXCLUSAO', label: 'Exclusão' },
  { value: 'FEEDBACK', label: 'Feedback' },
  { value: 'FECHAMENTO', label: 'Fechamento' },
  { value: 'GERACAO_IA', label: 'Análise Preditiva' },
  { value: 'GERACAO_PDF', label: 'Geração de PDF' },
];

export default function AuditoriaPage() {
  const { user } = useAuth();
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [actionFilter, setActionFilter] = useState('');
  const [loading, setLoading] = useState(true);

  async function loadLogs() {
    setLoading(true);
    try {
      const query = actionFilter ? `?action=${actionFilter}` : '';
      setLogs(await api.get<AuditLogEntry[]>(`/audit-logs${query}`));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionFilter]);

  if (user?.role !== 'ADMIN') {
    return <p className="text-sm text-p-neutral">Esta página é exclusiva do administrador.</p>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-p-primary-dark">Auditoria</h1>
          <p className="text-sm text-p-neutral">
            Registro de ações do sistema — quem fez o quê, e quando.
          </p>
        </div>
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
        >
          {ACTION_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-p-neutral text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-3">Quando</th>
              <th className="text-left px-4 py-3">Quem</th>
              <th className="text-left px-4 py-3">Ação</th>
              <th className="text-left px-4 py-3">Rota</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={4} className="text-center py-8 text-p-neutral">
                  Carregando...
                </td>
              </tr>
            )}
            {!loading && logs.length === 0 && (
              <tr>
                <td colSpan={4} className="text-center py-8 text-p-neutral">
                  Nenhum registro encontrado.
                </td>
              </tr>
            )}
            {logs.map((log) => (
              <tr key={log.id} className="border-t border-slate-100">
                <td className="px-4 py-3 text-p-neutral whitespace-nowrap">
                  {new Date(log.createdAt).toLocaleString('pt-BR')}
                </td>
                <td className="px-4 py-3 text-p-primary-dark">
                  {log.user ? log.user.fullName : <span className="text-p-neutral">—</span>}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={log.action} />
                </td>
                <td className="px-4 py-3 text-p-neutral font-mono text-xs">{log.entity ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-p-neutral mt-4">Mostrando os últimos {logs.length} registros.</p>
    </div>
  );
}
