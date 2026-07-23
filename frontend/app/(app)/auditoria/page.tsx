'use client';

import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, FileSpreadsheet, FileText, Download } from 'lucide-react';
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

const PAGE_SIZE = 20;

interface PaginatedLogs {
  items: AuditLogEntry[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export default function AuditoriaPage() {
  const { user } = useAuth();
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [actionFilter, setActionFilter] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<'csv' | 'xlsx' | 'pdf' | null>(null);

  async function loadLogs() {
    setLoading(true);
    try {
      const query = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
      if (actionFilter) query.set('action', actionFilter);
      const res = await api.get<PaginatedLogs>(`/audit-logs/paginated?${query.toString()}`);
      setLogs(res.items);
      setTotalPages(res.totalPages);
      setTotal(res.total);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionFilter, page]);

  // Trocar o filtro sempre volta pra página 1 — senão a pessoa pode ficar
  // numa página que não existe mais pro novo filtro.
  function handleActionFilterChange(value: string) {
    setActionFilter(value);
    setPage(1);
  }

  async function handleExport(format: 'csv' | 'xlsx' | 'pdf') {
    setExporting(format);
    try {
      const query = actionFilter ? `?action=${actionFilter}` : '';
      const blob = await api.getBlob(`/audit-logs/export/${format}${query}`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `auditoria.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao exportar.');
    } finally {
      setExporting(null);
    }
  }

  if (user?.role !== 'ADMIN') {
    return <p className="text-sm text-p-neutral">Esta página é exclusiva do administrador.</p>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-p-primary-dark">Auditoria</h1>
          <p className="text-sm text-p-neutral">
            Registro de ações do sistema — quem fez o quê, e quando.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={actionFilter}
            onChange={(e) => handleActionFilterChange(e.target.value)}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
          >
            {ACTION_FILTERS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>

          <button
            onClick={() => handleExport('csv')}
            disabled={exporting !== null}
            title="Exportar CSV"
            className="flex items-center gap-1.5 border border-slate-300 text-p-primary-dark px-3 py-2 rounded-lg text-sm font-medium hover:border-p-primary disabled:opacity-50"
          >
            <FileText size={14} />
            {exporting === 'csv' ? '...' : 'CSV'}
          </button>
          <button
            onClick={() => handleExport('xlsx')}
            disabled={exporting !== null}
            title="Exportar Excel"
            className="flex items-center gap-1.5 border border-slate-300 text-p-primary-dark px-3 py-2 rounded-lg text-sm font-medium hover:border-p-primary disabled:opacity-50"
          >
            <FileSpreadsheet size={14} />
            {exporting === 'xlsx' ? '...' : 'Excel'}
          </button>
          <button
            onClick={() => handleExport('pdf')}
            disabled={exporting !== null}
            title="Exportar PDF"
            className="flex items-center gap-1.5 border border-slate-300 text-p-primary-dark px-3 py-2 rounded-lg text-sm font-medium hover:border-p-primary disabled:opacity-50"
          >
            <Download size={14} />
            {exporting === 'pdf' ? '...' : 'PDF'}
          </button>
        </div>
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
                  {new Date(log.createdAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
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

      <div className="flex items-center justify-between mt-4">
        <p className="text-xs text-p-neutral">
          {total > 0 ? `${total} registro(s) no total` : 'Nenhum registro'}
        </p>
        {totalPages > 1 && (
          <div className="flex items-center gap-3">
            <button
              onClick={() => setPage((p) => Math.max(p - 1, 1))}
              disabled={page <= 1}
              className="flex items-center gap-1 text-sm text-p-primary-dark disabled:text-p-neutral disabled:cursor-not-allowed"
            >
              <ChevronLeft size={16} />
              Anterior
            </button>
            <span className="text-xs text-p-neutral">
              Página {page} de {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
              disabled={page >= totalPages}
              className="flex items-center gap-1 text-sm text-p-primary-dark disabled:text-p-neutral disabled:cursor-not-allowed"
            >
              Próxima
              <ChevronRight size={16} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
