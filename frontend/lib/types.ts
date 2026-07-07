export type UserRole = 'ADMIN' | 'GESTOR' | 'COLABORADOR';

export interface AuthUser {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
  areaId: string;
  areaName: string;
  positionName: string;
}

export interface LoginResponse {
  accessToken: string;
  mustChangePwd: boolean;
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
  areaId: string;
  area: Area;
  positionId: string;
  position: Position;
  managerId: string | null;
  manager: ManagerOption | null;
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
}

export interface PendingPulseFeedback {
  id: string;
  type: 'AUTOAVALIACAO' | 'GESTOR' | 'COLEGA';
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
