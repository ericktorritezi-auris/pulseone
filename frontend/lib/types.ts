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

export interface CollaboratorDashboard {
  score: number | null;
  scoreEvolution: { ciclo: string; score: number }[];
  npsRecomendacao: number | null;
  pulseAtual: string | null;
  ultimosRecebidos: Feedback[];
  ultimosEnviados: Feedback[];
}
