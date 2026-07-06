'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Send,
  Inbox,
  Activity,
  History,
  User,
  Users,
  Building2,
  Briefcase,
  RefreshCw,
  BarChart3,
  Settings,
  LogOut,
  FileText,
} from 'lucide-react';
import { useAuth } from '../../lib/auth-context';

interface MenuItem {
  href: string;
  label: string;
  icon: React.ElementType;
}

const COLABORADOR_MENU: MenuItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/feedbacks/recebidos', label: 'Feedbacks Recebidos', icon: Inbox },
  { href: '/feedbacks/enviados', label: 'Feedbacks Enviados', icon: Send },
  { href: '/pulse', label: 'Feedback Pulse', icon: Activity },
  { href: '/historico', label: 'Histórico', icon: History },
  { href: '/perfil', label: 'Meu Perfil', icon: User },
];

const GESTOR_MENU: MenuItem[] = [
  ...COLABORADOR_MENU.slice(0, 4),
  { href: '/pulse/time', label: 'Avaliação do Time', icon: Users },
  { href: '/relatorios', label: 'Relatórios', icon: FileText },
  ...COLABORADOR_MENU.slice(4),
];

const ADMIN_MENU: MenuItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/cadastros/pessoas', label: 'Pessoas', icon: Users },
  { href: '/cadastros/areas', label: 'Áreas', icon: Building2 },
  { href: '/cadastros/cargos', label: 'Cargos', icon: Briefcase },
  { href: '/ciclos-pulse', label: 'Ciclos Pulse', icon: RefreshCw },
  { href: '/relatorios', label: 'Relatórios', icon: BarChart3 },
  { href: '/configuracoes', label: 'Configurações', icon: Settings },
];

// Gestor também cadastra pessoas (restrito à própria área — seção 5.3 do mapeamento técnico)
const GESTOR_MENU_COM_CADASTRO: MenuItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/cadastros/pessoas', label: 'Pessoas', icon: Users },
  { href: '/feedbacks/recebidos', label: 'Feedbacks Recebidos', icon: Inbox },
  { href: '/feedbacks/enviados', label: 'Feedbacks Enviados', icon: Send },
  { href: '/pulse', label: 'Feedback Pulse', icon: Activity },
  { href: '/pulse/time', label: 'Avaliação do Time', icon: Users },
  { href: '/relatorios', label: 'Relatórios', icon: FileText },
  { href: '/historico', label: 'Histórico', icon: History },
  { href: '/perfil', label: 'Meu Perfil', icon: User },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  if (!user) return null;

  const menu =
    user.role === 'ADMIN'
      ? ADMIN_MENU
      : user.role === 'GESTOR'
        ? GESTOR_MENU_COM_CADASTRO
        : COLABORADOR_MENU;

  return (
    <aside className="w-64 shrink-0 bg-p-primary-dark text-white flex flex-col h-screen sticky top-0">
      <div className="px-6 py-5 border-b border-white/10">
        <span className="text-xl font-semibold">
          Pulse<span className="text-p-secondary">One</span>
        </span>
      </div>

      <nav className="flex-1 overflow-y-auto py-4">
        {menu.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-6 py-2.5 text-sm transition-colors ${
                active
                  ? 'bg-p-primary text-white font-medium'
                  : 'text-slate-300 hover:bg-white/5 hover:text-white'
              }`}
            >
              <Icon size={18} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <button
        onClick={logout}
        className="flex items-center gap-3 px-6 py-4 text-sm text-slate-300 hover:text-white border-t border-white/10"
      >
        <LogOut size={18} />
        Sair
      </button>
    </aside>
  );
}
