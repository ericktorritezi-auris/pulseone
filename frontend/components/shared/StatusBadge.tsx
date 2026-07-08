interface StatusBadgeProps {
  status: string;
}

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  RASCUNHO: { bg: '#E2E8F0', text: '#64748B', label: 'Rascunho' },
  ABERTO: { bg: '#DBEAFE', text: '#2563EB', label: 'Aberto' },
  ENCERRADO: { bg: '#FEF3C7', text: '#F59E0B', label: 'Encerrado' },
  EM_CONSOLIDACAO: { bg: '#FEF3C7', text: '#F59E0B', label: 'Em consolidação' },
  EM_ANDAMENTO: { bg: '#DBEAFE', text: '#2563EB', label: 'Em andamento' },
  AGUARDANDO_FECHAMENTO: { bg: '#FEF3C7', text: '#F59E0B', label: 'Aguardando fechamento' },
  FINALIZADO: { bg: '#D1FAE5', text: '#10B981', label: 'Finalizado' },
  ARQUIVADO: { bg: '#E2E8F0', text: '#64748B', label: 'Arquivado' },
  PENDENTE: { bg: '#FEE2E2', text: '#EF4444', label: 'Pendente' },
  ATIVO: { bg: '#D1FAE5', text: '#10B981', label: 'Ativo' },
  INATIVO: { bg: '#E2E8F0', text: '#64748B', label: 'Inativo' },
  // Ações de auditoria (seção 25 do PRD)
  LOGIN: { bg: '#D1FAE5', text: '#10B981', label: 'Login' },
  LOGOUT: { bg: '#E2E8F0', text: '#64748B', label: 'Logout' },
  CADASTRO: { bg: '#DBEAFE', text: '#2563EB', label: 'Cadastro' },
  EDICAO: { bg: '#FEF3C7', text: '#F59E0B', label: 'Edição' },
  EXCLUSAO: { bg: '#FEE2E2', text: '#EF4444', label: 'Exclusão' },
  FEEDBACK: { bg: '#DBEAFE', text: '#2563EB', label: 'Feedback' },
  FECHAMENTO: { bg: '#FEF3C7', text: '#F59E0B', label: 'Fechamento' },
  GERACAO_IA: { bg: '#EDE9FE', text: '#7C3AED', label: 'Geração de IA' },
  GERACAO_PDF: { bg: '#EDE9FE', text: '#7C3AED', label: 'Geração de PDF' },
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const style = STATUS_STYLES[status] ?? { bg: '#E2E8F0', text: '#64748B', label: status };

  return (
    <span
      className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium"
      style={{ backgroundColor: style.bg, color: style.text }}
    >
      {style.label}
    </span>
  );
}
