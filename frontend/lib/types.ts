export type UserRole = 'ADMIN' | 'GESTOR' | 'COLABORADOR';

export interface AuthUser {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
  areaId: string | null;
  areaName: string | null;
  positionName: string | null;
}

export interface LoginResponse {
  accessToken: string;
  mustChangePwd: boolean;
  pendingSystemNps?: boolean;
  user: AuthUser;
}

export interface Area {
  id: string;
  name: string;
}

export interface Position {
  id: string;
  name: string;
  isManager: boolean;
  areaId: string;
  area?: { name: string };
}

export interface ManagerOption {
  id: string;
  fullName: string;
}

export interface Person {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  role: UserRole;
  active: boolean;
  areaId: string | null;
  area: Area | null;
  positionId: string | null;
  position: Position | null;
  managerId: string | null;
  manager: ManagerOption | null;
  managedAreas?: { id: string }[];
}

export interface Feedback {
  id: string;
  texto: string;
  criadoEm: string;
  remetente?: string;
  destinatario?: string;
}

export interface Notification {
  id: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
}

export interface PulseQuestion {
  id: string;
  order: number;
  text: string;
  dimension: string;
  isNps: boolean;
}

export interface PulseCycle {
  id: string;
  label: string;
  status: string;
  openedAt: string | null;
  deadline: string | null;
  closedAt: string | null;
  createdAt: string;
  areaId?: string | null;
  area?: { name: string } | null;
}

export interface PendingPulseFeedback {
  id: string;
  cycleId: string;
  type: 'AUTOAVALIACAO' | 'AVALIACAO_EQUIPE' | 'AVALIACAO_GESTOR' | 'COLEGA';
  status: string;
  target: { fullName: string };
  cycle: { label: string; status: string };
  editable?: boolean;
}

export interface PulseFeedbackDetail extends PendingPulseFeedback {
  comment: string | null;
  answers: { questionId: string; value: number }[];
  questions: PulseQuestion[];
  editable: boolean;
}

export interface PulseAtual {
  label: string;
  deadline: string | null;
  pendentes: number;
  total: number;
}

export interface CollaboratorDashboard {
  score: number | null;
  scoreEvolution: { ciclo: string; score: number }[];
  npsRecomendacao: number | null;
  pulseAtual: PulseAtual | null;
  ultimosRecebidos: Feedback[];
  ultimosEnviados: Feedback[];
}


export interface AreaProgress {
  areaId: string;
  areaName: string;
  total: number;
  finalizados: number;
  percentual: number;
  pendentes?: { id: string; fullName: string; role: string }[];
}

export interface CycleProgress {
  areas: AreaProgress[];
  percentualGeral: number;
}

export interface TeamMemberProgress {
  userId: string;
  fullName: string;
  role: string;
  total: number;
  finalizados: number;
  percentual: number;
}

export interface PulseScoreSummary {
  teamScore: number;
  managerScore: number;
  selfScore: number;
  finalScore: number;
  npsScore: number;
  scoreBand: string;
}

export interface ReportComment {
  tipo: string;
  autor: string;
  texto: string | null;
}

export interface AiAnalysis {
  strengths: string;
  improvements: string;
  trends: string;
  summary: string;
  suggestedOpinion: string;
  model: string;
  regenCount: number;
}

export interface ReportListItem {
  id: string;
  status: string;
  owner?: { id: string; fullName: string };
  cycle: { label: string; status: string };
}

export interface ReportDetail {
  id: string;
  status: string;
  managerFinalOpinion: string | null;
  finalizedAt: string | null;
  requiresOpinion: boolean;
  owner: { id: string; fullName: string; areaName: string; positionName: string };
  cycle: { label: string; status: string };
  score: PulseScoreSummary | null;
  aiAnalysis: AiAnalysis | null;
  comentarios: ReportComment[];
}

export interface AdminDashboardData {
  totalAreas: number;
  totalCargos: number;
  pessoasPorArea: { areaName: string; total: number }[];
  totalPulsos: number;
  ciclosAbertos: {
    id: string;
    label: string;
    areaName: string;
    deadline: string | null;
    participacaoPercentual: number;
    pendencias: number;
  }[];
}

export interface ManagerDashboardData {
  teamSize: number;
  team: { id: string; fullName: string; positionName: string; areaName: string }[];
  cycleLabel: string | null;
  porArea: {
    areaId: string;
    areaName: string;
    colaboradores: number;
    scoreMedio: number | null;
    npsMedio: number | null;
  }[];
  avaliacaoRecebidaPorArea: { areaName: string; scoreMedio: number }[];
}

export interface AuditLogEntry {
  id: string;
  action: string;
  entity: string | null;
  entityId: string | null;
  createdAt: string;
  user: { fullName: string; email: string } | null;
}

export interface SystemNpsCampaignStatus {
  active: boolean;
  createdAt: string | null;
  totalElegiveis: number;
  totalResponderam: number;
}

export interface SystemNpsSummary {
  total: number;
  promoters: number;
  passives: number;
  detractors: number;
  npsScore: number;
  comments: { id: string; score: number; comment: string; createdAt: string }[];
}

export interface SpecialistAssignmentItem {
  id: string;
  description: string;
  active: boolean;
  createdAt: string;
  user: {
    id: string;
    fullName: string;
    area: { name: string } | null;
    position: { name: string } | null;
  };
}

export interface EligibleSpecialistUser {
  id: string;
  fullName: string;
}

export interface AnnouncementItem {
  id: string;
  text: string;
  active: boolean;
  createdAt: string;
  createdBy?: { fullName: string };
  areaId?: string | null;
  area?: { name: string } | null;
}

// v1.4.0 — Dossiê Confidencial (pedido do Erick)
export interface DossieBenefit {
  id: string;
  nome: string;
  valor: number;
}

export interface DossieVacationPeriod {
  id: string;
  startDate: string;
  endDate: string;
}

export interface DossieFormacao {
  id: string;
  nome: string;
  dataConclusao: string;
}

export interface DossieCertificacao {
  id: string;
  nome: string;
  dataConclusao: string;
}

export interface DossieData {
  pessoa: {
    id: string;
    fullName: string;
    email: string;
    phone: string;
    role: string;
    active: boolean;
    areaName: string | null;
    positionName: string | null;
    managerName: string | null;
  };
  confidencial: {
    salario: number | null;
    regimeContratacao: 'CLT' | 'COOPERADO' | 'PJ' | null;
    modalidadeTrabalho: 'PRESENCIAL' | 'REMOTO' | 'HIBRIDO' | null;
    hibridoDiasPresencial: number | null;
    hibridoDiasSemana: string[];
    dataInicioEmpresa: string | null;
    beneficios: DossieBenefit[];
    periodosFerias: DossieVacationPeriod[];
  };
  pulse: {
    ciclosParticipados: number;
    scoreAtual: number | null;
    evolucao: { cicloLabel: string; finalScore: number; npsScore: number }[];
    ultimoCicloLabel: string | null;
    ultimoParecer: string | null;
    ultimosFeedbacks: { tipo: string; autor: string; texto: string }[];
  };
  atribuicoesEspecialistas: string[];
  feedbacksAvulsos: { autor: string; texto: string; data: string }[];
  formacaoECertificacoes: {
    formacoes: DossieFormacao[];
    certificacoes: DossieCertificacao[];
  };
}
